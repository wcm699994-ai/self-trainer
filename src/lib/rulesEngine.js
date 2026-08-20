/**
 * SelfTrainer 核心规则引擎
 * 采用「目标偏差率 + 7日滑动中位数」方案
 */

function indicatorDeviationRate(indicator, value) {
  const target = Number(indicator.target) || 0;
  const numericValue = Number(value);

  let denominator;
  if (target === 0) {
    denominator = 3;
  } else {
    denominator = Math.abs(target);
  }

  if (indicator.type === 'loss') {
    return (numericValue - target) / denominator;
  } else {
    return (target - numericValue) / denominator;
  }
}

export function computeDailyScores(config, records) {
  const lossIndicators = config.lossIndicators || [];
  const gainIndicators = config.gainIndicators || [];

  return records
    .map((record) => {
      let lossScore = null;
      let gainScore = null;

      if (lossIndicators.length > 0) {
        let weightedSum = 0;
        let weightSum = 0;
        lossIndicators.forEach((ind) => {
          const raw = record.values?.[ind.name];
          if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return;
          const rate = indicatorDeviationRate({ ...ind, type: 'loss' }, raw);
          const weight = Number(ind.weight) || 1;
          weightedSum += rate * weight;
          weightSum += weight;
        });
        if (weightSum > 0) lossScore = weightedSum / weightSum;
      }

      if (gainIndicators.length > 0) {
        let weightedSum = 0;
        let weightSum = 0;
        gainIndicators.forEach((ind) => {
          const raw = record.values?.[ind.name];
          if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return;
          const rate = indicatorDeviationRate({ ...ind, type: 'gain' }, raw);
          const weight = Number(ind.weight) || 1;
          weightedSum += rate * weight;
          weightSum += weight;
        });
        if (weightSum > 0) gainScore = weightedSum / weightSum;
      }

      return { date: record.date, lossScore, gainScore };
    })
    .filter((item) => item.lossScore !== null || item.gainScore !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function movingAverage(data, windowSize = 7) {
  return data.map((point, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = data.slice(start, index + 1);
    const avg = (key) => {
      const valid = slice.filter((item) => item[key] !== null && item[key] !== undefined);
      if (valid.length === 0) return null;
      return valid.reduce((acc, item) => acc + Number(item[key]), 0) / valid.length;
    };
    return {
      ...point,
      lossMA: avg('lossScore'),
      gainMA: avg('gainScore')
    };
  });
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function generateSuggestion(config, records) {
  const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedRecords.length === 0) {
    return { text: '暂无数据，请先录入今日数据。' };
  }

  const recent = sortedRecords.slice(-7);
  const latest = sortedRecords[sortedRecords.length - 1];

  const recentTags = recent.flatMap((r) => r.tags || []);
  const hasInterference = recentTags.includes('生病') || recentTags.includes('突发事件');

  const allIndicators = [
    ...(config.lossIndicators || []).map((ind) => ({ ...ind, type: 'loss' })),
    ...(config.gainIndicators || []).map((ind) => ({ ...ind, type: 'gain' }))
  ];

  const candidates = allIndicators
    .map((ind) => {
      const value = latest.values?.[ind.name];
      if (value === undefined || value === null || Number.isNaN(Number(value))) return null;

      const numericValue = Number(value);
      const deviationRate = indicatorDeviationRate(ind, numericValue);

      if (deviationRate <= 0.15) return null;

      const cleanedSeries = recent
        .filter((r) => !((r.tags || []).includes('生病') || (r.tags || []).includes('突发事件')))
        .map((r) => r.values?.[ind.name])
        .filter((v) => v !== undefined && v !== null && !Number.isNaN(Number(v)))
        .map(Number);

      if (cleanedSeries.length < 3) return null;

      const median7 = median(cleanedSeries);
      if (median7 === null) return null;

      const target = Number(ind.target) || 0;
      const step1 = Math.abs(numericValue - median7) * 0.3;
      const step2 = Math.abs(numericValue) * 0.2;
      const step3 = Math.abs(numericValue - target) * 0.5;
      let step = Math.min(step1, step2, step3);

      if (step < 0.5) step = 0.5;
      const cap = Math.max(Math.abs(numericValue) * 0.2, 0.5);
      if (step > cap) step = cap;

      if (hasInterference) {
        step = Math.max(step * 0.5, 0.5);
      }

      const newValue =
        ind.type === 'loss'
          ? Math.max(numericValue - step, 0)
          : numericValue + step;

      return {
        ...ind,
        value: numericValue,
        deviationRate,
        step,
        newValue,
        priority: Math.min(Math.abs(deviationRate), 2.0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  if (candidates.length === 0) {
    return { text: '当前各项指标均在目标范围内，或样本不足，暂不生成调整建议。' };
  }

  const best = candidates[0];
  const direction = best.type === 'loss' ? '降低' : '提升';

  if (hasInterference) {
    return {
      text: `近期存在生病/突发事件干扰，建议优先休息恢复。可小幅${direction}「${best.name}」：${best.value}${best.unit || ''} → ${best.newValue.toFixed(1)}${best.unit || ''}（步长已减半）。`
    };
  }

  return {
    text: `建议${direction}「${best.name}」：${best.value}${best.unit || ''} → ${best.newValue.toFixed(1)}${best.unit || ''}（目标 ${best.target}${best.unit || ''}，单次步长 ${best.step.toFixed(1)}${best.unit || ''}）。`
  };
}

export function generateReviewConclusion(config, cleanedRecords, rangeDays = 7) {
  const scores = computeDailyScores(config, cleanedRecords);
  const sampleNote = cleanedRecords.length < 3 ? '样本较少，结论仅供参考' : '';

  if (scores.length === 0) {
    return {
      trend: '暂无数据',
      issue: '',
      suggestion: '',
      sampleNote
    };
  }

  const half = Math.ceil(scores.length / 2);
  const firstHalf = scores.slice(0, half);
  const secondHalf = scores.slice(half);

  const avgScore = (arr, key) => {
    const valid = arr.filter((item) => item[key] !== null && item[key] !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((sum, item) => sum + Number(item[key]), 0) / valid.length;
  };

  const lossFirst = avgScore(firstHalf, 'lossScore');
  const lossSecond = avgScore(secondHalf, 'lossScore');
  const gainFirst = avgScore(firstHalf, 'gainScore');
  const gainSecond = avgScore(secondHalf, 'gainScore');

  let lossTrend = '震荡';
  let gainTrend = '震荡';

  if (lossFirst !== null && lossSecond !== null) {
    const diff = lossSecond - lossFirst;
    if (diff > 0.05) lossTrend = '恶化';
    else if (diff < -0.05) lossTrend = '收敛';
  }

  if (gainFirst !== null && gainSecond !== null) {
    const diff = gainSecond - gainFirst;
    if (diff > 0.05) gainTrend = '收敛';
    else if (diff < -0.05) gainTrend = '恶化';
  }

  const trend = `本周损失趋势呈${lossTrend}，增益趋势呈${gainTrend}。`;

  const latest = cleanedRecords[cleanedRecords.length - 1];
  let issue = '';

  if (latest) {
    const allIndicators = [
      ...(config.lossIndicators || []).map((ind) => ({ ...ind, type: 'loss' })),
      ...(config.gainIndicators || []).map((ind) => ({ ...ind, type: 'gain' }))
    ];

    let worst = null;
    let worstRate = -Infinity;

    allIndicators.forEach((ind) => {
      const value = latest.values?.[ind.name];
      if (value === undefined || value === null || Number.isNaN(Number(value))) return;
      const rate = indicatorDeviationRate(ind, value);
      if (rate > worstRate) {
        worstRate = rate;
        worst = { ...ind, rate };
      }
    });

    if (worst) {
      issue = `核心问题点：偏差最大的指标为「${worst.name}」，偏离目标 ${
        Math.abs(worst.rate * 100).toFixed(0)
      }%。`;
    } else {
      issue = '核心问题点：未检测到明显偏差。';
    }
  } else {
    issue = '核心问题点：暂无数据。';
  }

  const suggestion = generateSuggestion(config, cleanedRecords).text;

  return {
    trend,
    issue,
    suggestion,
    sampleNote
  };
}

export function getRestReminders(config, records) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const reminders = [];

  if (sorted.length < 3) return reminders;

  const recent3 = sorted.slice(-3);
  const tags3 = recent3.flatMap((r) => r.tags || []);
  const hasInterference = tags3.includes('生病') || tags3.includes('突发事件');

  if (hasInterference) {
    const scores = computeDailyScores(config, recent3);
    if (
      scores.length === 3 &&
      scores[0].lossScore !== null &&
      scores[2].lossScore !== null &&
      scores[2].lossScore > scores[0].lossScore + 0.05
    ) {
      reminders.push('近期存在生病/突发事件标签，且损失趋势上升，建议优先安排休息恢复。');
    }
  }

  const recent7 = sorted.slice(-7);
  if (recent7.length >= 7) {
    const hasRestMarker = recent7.some(
      (r) => (r.tags || []).includes('生病') || (r.tags || []).includes('突发事件')
    );

    if (!hasRestMarker) {
      reminders.push('连续 7 天未出现休息标记，建议安排放松时间。');
    }
  }

  return reminders;
}
