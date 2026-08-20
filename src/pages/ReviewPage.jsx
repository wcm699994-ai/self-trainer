import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  computeDailyScores,
  movingAverage,
  generateReviewConclusion
} from '../lib/rulesEngine';
import { chatCompletion, REVIEW_SYSTEM_PROMPT } from '../lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

function toDateStr(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function getTrendColor(scores, key, betterWhenLower) {
  if (scores.length < 3) return '#6b7280';

  const half = Math.ceil(scores.length / 2);
  const first = scores.slice(0, half);
  const second = scores.slice(half);

  const avg = (arr) => {
    const valid = arr.filter((item) => item[key] !== null && item[key] !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((sum, item) => sum + Number(item[key]), 0) / valid.length;
  };

  const firstAvg = avg(first);
  const secondAvg = avg(second);

  if (firstAvg === null || secondAvg === null) return '#6b7280';

  const diff = secondAvg - firstAvg;
  if (Math.abs(diff) < 0.05) return '#6b7280';

  if (betterWhenLower) {
    return diff > 0 ? '#f97316' : '#0891b2';
  }

  return diff > 0 ? '#0891b2' : '#f97316';
}

export default function ReviewPage() {
  const config = useStore((s) => s.config);
  const records = useStore((s) => s.records);
  const apiConfig = useStore((s) => s.apiConfig);

  const [range, setRange] = useState(7);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReview, setAiReview] = useState('');
  const [aiError, setAiError] = useState(false);

  const [todayStr, setTodayStr] = useState(() => toDateStr(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = toDateStr(new Date());
      setTodayStr((prevToday) => {
        if (prevToday !== newToday) {
          return newToday;
        }
        return prevToday;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const hasApiKey = apiConfig.apiKey && apiConfig.apiKey.trim();

  const filtered = useMemo(() => {
    const cutoff = addDays(todayStr, -range);
    return records
      .filter((record) => record.date >= cutoff && record.date <= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, range, todayStr]);

  const cleanedFiltered = useMemo(
    () =>
      filtered.filter(
        (r) => !((r.tags || []).includes('生病') || (r.tags || []).includes('突发事件'))
      ),
    [filtered]
  );

  const scores = useMemo(() => computeDailyScores(config, cleanedFiltered), [config, cleanedFiltered]);
  const ma = useMemo(() => movingAverage(scores, 7), [scores]);
  const conclusion = useMemo(
    () => generateReviewConclusion(config, cleanedFiltered, range),
    [config, cleanedFiltered, range]
  );

  const lossColor = getTrendColor(scores, 'lossScore', true);
  const gainColor = getTrendColor(scores, 'gainScore', false);

  const runAIReview = async () => {
    if (!hasApiKey || aiLoading) return;

    setAiLoading(true);
    setAiError(false);
    setAiReview('');

    try {
      const summary = {
        rangeDays: range,
        indicators: {
          loss: config.lossIndicators || [],
          gain: config.gainIndicators || []
        },
        records: cleanedFiltered.map((record) => ({
          date: record.date,
          values: record.values,
          tags: record.tags || [],
          isBackfill: record.isBackfill || false
        })),
        ruleConclusion: conclusion
      };

      const content = await chatCompletion(
        [
          {
            role: 'user',
            content: JSON.stringify(summary)
          }
        ],
        REVIEW_SYSTEM_PROMPT
      );

      setAiReview(content);
    } catch (e) {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">周度趋势</h2>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setRange(7)}
              className={`px-3 py-1 rounded ${
                range === 7 ? 'bg-gray-900 text-white' : 'border border-gray-200'
              }`}
            >
              近 7 天
            </button>
            <button
              onClick={() => setRange(30)}
              className={`px-3 py-1 rounded ${
                range === 30 ? 'bg-gray-900 text-white' : 'border border-gray-200'
              }`}
            >
              近 30 天
            </button>
          </div>
        </div>

        {ma.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            {cleanedFiltered.length === 0 && filtered.length > 0
              ? '当前时间范围内所有记录均带有生病/突发事件标签，已从趋势中过滤。'
              : '暂无数据，请先录入训练样本。'}
          </p>
        ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ma} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => value.slice(5)}
                  minTickGap={20}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="lossMA"
                  name="损失趋势"
                  stroke={lossColor}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="gainMA"
                  name="增益趋势"
                  stroke={gainColor}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          默认展示 7 日移动平均线，弱化单日波动。
        </p>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-medium">基础复盘结论</h3>
        <div className="mt-2 space-y-1 text-sm leading-6">
          <p>{conclusion.trend}</p>
          {conclusion.issue && <p>{conclusion.issue}</p>}
          {conclusion.suggestion && <p>{conclusion.suggestion}</p>}
          {conclusion.sampleNote && (
            <p className="text-xs text-gray-500">{conclusion.sampleNote}</p>
          )}
        </div>
      </section>

      {hasApiKey && (
        <details
          open={aiOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setAiOpen(open);
            if (open && !aiReview && !aiError) runAIReview();
          }}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <summary className="cursor-pointer text-sm text-gray-500">
            AI 深度复盘（可选）
          </summary>
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-2">
              将发送近 {range} 天清洗后的结构化数据（不含身份信息）用于分析。
            </p>
            {aiLoading ? (
              <p className="text-sm text-gray-500">AI 分析中...</p>
            ) : aiError ? (
              <div className="text-sm text-gray-500">
                AI 分析失败，请检查网络或 API 配置。
                <button
                  onClick={runAIReview}
                  className="ml-2 border border-gray-300 rounded px-2 py-1 text-gray-700 hover:bg-gray-50"
                >
                  重试
                </button>
              </div>
            ) : aiReview ? (
              <p className="text-sm leading-6">{aiReview}</p>
            ) : (
              <p className="text-sm text-gray-500">点击展开后生成深度分析。</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
