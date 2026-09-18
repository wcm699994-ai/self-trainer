/**
 * SelfTrainer 核心规则引擎
 * 采用「目标偏差率 + 7日滑动中位数」方案
 */

import { allIndicatorsOf } from './indicators';

// ---- 调参算法参数（集中管理，便于调整） ----
const DEVIATION_THRESHOLD = 0.15;   // 偏差率超过该值才生成建议
const TREND_THRESHOLD = 0.05;       // 复盘前后半段均值差超过该值判定趋势
const STEP_MEDIAN_RATIO = 0.3;      // 步长候选1：偏离 7 日中位数的比例
const STEP_CURRENT_RATIO = 0.2;     // 步长候选2：当前值的比例
const STEP_TARGET_RATIO = 0.5;      // 步长候选3：距目标差值的比例
const STEP_MIN = 0.5;               // 单次最小步长
const STEP_CAP_RATIO = 0.2;         // 步长上限：当前值的比例
const TARGET_ZERO_DENOMINATOR = 3;  // 目标为 0 时偏差率分母
const MIN_SERIES_FOR_MEDIAN = 3;    // 参与中位数计算的最少样本数
const INTERFERENCE_TAGS = ['生病', '突发事件'];

// 计数类单位：按整数步进（次/个/篇等），时长/距离类保持小数步进
const COUNT_UNITS = ['次', '个', '篇', '件', '项', '回', '顿', '杯', '页', '章', '天', '种', '本', '门'];

function isCountUnit(indicator) {
  const unit = String(indicator.unit || '').trim();
  if (!unit) return false;
  return COUNT_UNITS.some((u) => unit.includes(u));
}

// 数值展示：整数不补小数位
function fmtValue(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
}

function hasInterferenceTag(record) {
  return (record.tags || []).some((tag) => INTERFERENCE_TAGS.includes(tag));
}

export { hasInterferenceTag };

function indicatorDeviationRate(indicator, value) {
  const target = Number(indicator.target) || 0;
  const numericValue = Number(value);

  const denominator =
    target === 0 ? TARGET_ZERO_DENOMINATOR : Math.abs(target);

  if (indicator.type === 'loss') {
    return (numericValue - target) / denominator;
  } else {
    return (target - numericValue) / denominator;
  }
}

// 某类型指标列表的加权平均偏差率；无可用值时返回 null
function weightedDeviationScore(indicators, values, type) {
  if (!indicators || indicators.length === 0) return null;

  let weightedSum = 0;
  let weightSum = 0;
  indicators.forEach((ind) => {
    const raw = values?.[ind.id];
    if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return;
    const rate = indicatorDeviationRate({ ...ind, type }, raw);
    const weight = Number(ind.weight) || 1;
    weightedSum += rate * weight;
    weightSum += weight;
  });
  return weightSum > 0 ? weightedSum / weightSum : null;
}

export function computeDailyScores(config, records) {
  return records
    .map((record) => ({
      date: record.date,
      lossScore: weightedDeviationScore(config.lossIndicators, record.values, 'loss'),
      gainScore: weightedDeviationScore(config.gainIndicators, record.values, 'gain')
    }))
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

  const hasInterference = recent.some(hasInterferenceTag);

  const allIndicators = allIndicatorsOf(config);

  let hasDeviation = false;
  let hasInsufficientSamples = false;

  const candidates = allIndicators
    .map((ind) => {
      const value = latest.values?.[ind.id];
      if (value === undefined || value === null || Number.isNaN(Number(value))) return null;

      const numericValue = Number(value);
      const deviationRate = indicatorDeviationRate(ind, numericValue);

      if (deviationRate <= DEVIATION_THRESHOLD) return null;
      hasDeviation = true;

      const cleanedSeries = recent
        .filter((r) => !hasInterferenceTag(r))
        .map((r) => r.values?.[ind.id])
        .filter((v) => v !== undefined && v !== null && !Number.isNaN(Number(v)))
        .map(Number);

      if (cleanedSeries.length < MIN_SERIES_FOR_MEDIAN) {
        hasInsufficientSamples = true;
        return null;
      }

      const median7 = median(cleanedSeries);
      if (median7 === null) return null;

      const target = Number(ind.target) || 0;
      const step1 = Math.abs(numericValue - median7) * STEP_MEDIAN_RATIO;
      const step2 = Math.abs(numericValue) * STEP_CURRENT_RATIO;
      const step3 = Math.abs(numericValue - target) * STEP_TARGET_RATIO;
      let step = Math.min(step1, step2, step3);

      if (step < STEP_MIN) step = STEP_MIN;
      const cap = Math.max(Math.abs(numericValue) * STEP_CAP_RATIO, STEP_MIN);
      if (step > cap) step = cap;

      if (hasInterference) {
        step = Math.max(step * 0.5, STEP_MIN);
      }

      let newValue;
      if (isCountUnit(ind)) {
        // 计数类指标（次/个/篇…）：步长取整且最小为 1，建议值保持整数
        step = Math.max(Math.round(step), 1);
        newValue =
          ind.type === 'loss'
            ? Math.max(Math.round(numericValue) - step, 0)
            : Math.round(numericValue) + step;
      } else {
        newValue =
          ind.type === 'loss'
            ? Math.max(numericValue - step, 0)
            : numericValue + step;
      }

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
    if (hasDeviation && hasInsufficientSamples) {
      return { text: '检测到指标偏离目标，但近 7 天有效样本不足，继续记录几天后即可生成调参建议。' };
    }
    return { text: '当前各项指标均在目标范围内，继续保持。' };
  }

  const best = candidates[0];
  const direction = best.type === 'loss' ? '降低' : '提升';

  if (hasInterference) {
    return {
      text: `近期存在生病/突发事件干扰，建议优先休息恢复。可小幅${direction}「${best.name}」：${fmtValue(best.value)}${best.unit || ''} → ${fmtValue(best.newValue)}${best.unit || ''}（步长已减半）。`
    };
  }

  return {
    text: `建议${direction}「${best.name}」：${fmtValue(best.value)}${best.unit || ''} → ${fmtValue(best.newValue)}${best.unit || ''}（目标 ${fmtValue(best.target)}${best.unit || ''}，梯度步长 ${fmtValue(best.step)}${best.unit || ''}）。`
  };
}

export function generateReviewConclusion(config, cleanedRecords) {
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
    if (diff > TREND_THRESHOLD) lossTrend = '恶化';
    else if (diff < -TREND_THRESHOLD) lossTrend = '收敛';
  }

  if (gainFirst !== null && gainSecond !== null) {
    const diff = gainSecond - gainFirst;
    if (diff > TREND_THRESHOLD) gainTrend = '收敛';
    else if (diff < -TREND_THRESHOLD) gainTrend = '恶化';
  }

  const trend = `统计区间内损失趋势呈${lossTrend}，增益趋势呈${gainTrend}。`;

  const latest = cleanedRecords[cleanedRecords.length - 1];
  let issue = '';

  if (latest) {
    const allIndicators = allIndicatorsOf(config);

    let worst = null;
    let worstRate = -Infinity;

    allIndicators.forEach((ind) => {
      const value = latest.values?.[ind.id];
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
  const hasInterference = recent3.some(hasInterferenceTag);

  if (hasInterference) {
    const scores = computeDailyScores(config, recent3);
    if (
      scores.length === 3 &&
      scores[0].lossScore !== null &&
      scores[2].lossScore !== null &&
      scores[2].lossScore > scores[0].lossScore + TREND_THRESHOLD
    ) {
      reminders.push('近期存在生病/突发事件标签，且损失趋势上升，建议优先安排休息恢复。');
    }
  }

  const recent7 = sorted.slice(-7);
  if (recent7.length >= 7) {
    const hasRestMarker = recent7.some(hasInterferenceTag);

    if (!hasRestMarker) {
      reminders.push('连续 7 天未出现休息标记，建议安排放松时间。');
    }
  }

  return reminders;
}
