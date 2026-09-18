import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  computeDailyScores,
  movingAverage,
  generateReviewConclusion,
  hasInterferenceTag
} from '../lib/rulesEngine';
import { chatCompletion, REVIEW_SYSTEM_PROMPT } from '../lib/api';
import { useTodayStr } from '../hooks/useTodayStr';
import { addDays } from '../lib/date';
import { allIndicatorsOf } from '../lib/indicators';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';

export default function ReviewPage() {
  const config = useStore((s) => s.config);
  const records = useStore((s) => s.records);
  const apiConfig = useStore((s) => s.apiConfig);

  const today = useTodayStr();
  const [range, setRange] = useState(7);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReview, setAiReview] = useState('');
  const [aiError, setAiError] = useState(false);

  const aiAbortRef = useRef(null);
  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const hasApiKey = apiConfig.apiKey && apiConfig.apiKey.trim();

  const filtered = useMemo(() => {
    const cutoff = addDays(today, -range);
    return records
      .filter((record) => record.date >= cutoff && record.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, range, today]);

  const cleanedFiltered = useMemo(
    () => filtered.filter((r) => !hasInterferenceTag(r)),
    [filtered]
  );

  const scores = useMemo(() => computeDailyScores(config, cleanedFiltered), [config, cleanedFiltered]);
  const ma = useMemo(() => movingAverage(scores, 7), [scores]);
  const conclusion = useMemo(
    () => generateReviewConclusion(config, cleanedFiltered),
    [config, cleanedFiltered]
  );

  // 固定配色：损失趋势橙、增益趋势青，保证两条线始终可区分
  const lossColor = '#f97316';
  const gainColor = '#0891b2';

  // 单指标走势
  const indOptions = useMemo(() => allIndicatorsOf(config), [config]);
  const [selectedIndId, setSelectedIndId] = useState('');
  const selectedInd = indOptions.find((ind) => ind.id === selectedIndId) || indOptions[0];
  const indLineColor = selectedInd?.type === 'loss' ? '#f97316' : '#0891b2';

  const indData = useMemo(() => {
    if (!selectedInd) return [];
    return cleanedFiltered
      .filter((r) => r.values?.[selectedInd.id] !== undefined)
      .map((r) => ({ date: r.date, value: Number(r.values[selectedInd.id]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cleanedFiltered, selectedInd]);

  const runAIReview = async () => {
    if (!hasApiKey || aiLoading) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

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
        REVIEW_SYSTEM_PROMPT,
        undefined,
        { timeoutMs: 30000, retries: 0, signal: controller.signal }
      );

      if (controller.signal.aborted) return;
      setAiReview(content);
    } catch (e) {
      if (!controller.signal.aborted) setAiError(true);
    } finally {
      if (!controller.signal.aborted) setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4 page-fade">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">周度趋势</h2>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setRange(7)}
              className={range === 7 ? 'btn-primary !px-3 !py-1.5' : 'btn-secondary'}
            >
              近 7 天
            </button>
            <button
              type="button"
              onClick={() => setRange(30)}
              className={range === 30 ? 'btn-primary !px-3 !py-1.5' : 'btn-secondary'}
            >
              近 30 天
            </button>
          </div>
        </div>

        {ma.length === 0 ? (
          <p className="mt-4 muted">
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

      {indOptions.length > 0 && (
        <section className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">单指标走势</h2>
            <select
              value={selectedInd?.id || ''}
              onChange={(e) => setSelectedIndId(e.target.value)}
              className="input"
            >
              {indOptions.map((ind) => (
                <option key={ind.id} value={ind.id}>
                  {ind.name}（{ind.type === 'loss' ? '损失' : '增益'}）
                </option>
              ))}
            </select>
          </div>

          {indData.length === 0 ? (
            <p className="mt-4 muted">所选指标在当前范围内暂无数据。</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={indData} margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => value.slice(5)}
                    minTickGap={20}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine
                    y={selectedInd.target}
                    stroke="#9ca3af"
                    strokeDasharray="4 4"
                    label={{
                      value: `目标 ${selectedInd.target}`,
                      position: 'right',
                      fontSize: 11,
                      fill: '#6b7280'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={selectedInd.name}
                    stroke={indLineColor}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      <section className="card p-4">
        <h3 className="section-title">基础复盘结论</h3>
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
          className="card p-4"
        >
          <summary className="cursor-pointer text-sm text-gray-500">
            AI 深度复盘（可选）
          </summary>
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-2">
              将发送近 {range} 天清洗后的结构化数据（不含身份信息）用于分析，最长等待 30 秒。
            </p>
            {aiLoading ? (
              <p className="text-sm text-gray-500">AI 分析中...</p>
            ) : aiError ? (
              <div className="text-sm text-gray-500">
                AI 分析失败，请检查网络或 API 配置。
                <button type="button" onClick={runAIReview} className="btn-secondary ml-2">
                  重试
                </button>
              </div>
            ) : aiReview ? (
              <p className="text-sm leading-6 whitespace-pre-wrap">{aiReview}</p>
            ) : (
              <p className="text-sm text-gray-500">点击展开后生成深度分析。</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
