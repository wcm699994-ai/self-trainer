import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { loadDraft, saveDraft, clearDraft } from '../lib/storage';
import { generateSuggestion, getRestReminders } from '../lib/rulesEngine';
import { useTodayStr } from '../hooks/useTodayStr';
import { addDays } from '../lib/date';
import {
  allIndicatorsOf,
  indicatorsFromTemplate,
  normalizeRecordValues
} from '../lib/indicators';
import { templates } from '../lib/templates';

const REST_REMINDER_KEY = 'selftrainer_rest_reminder_v1';
const REST_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export default function HomePage() {
  const config = useStore((s) => s.config);
  const records = useStore((s) => s.records);
  const saveRecord = useStore((s) => s.saveRecord);
  const setConfig = useStore((s) => s.setConfig);

  const today = useTodayStr();
  const minDate = useMemo(() => addDays(today, -7), [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [values, setValues] = useState({});
  const [tags, setTags] = useState([]);
  const [saved, setSaved] = useState(false);

  // 跨天时：若当前选中的正是“昨天记为今天”的日期，自动跟进到新的一天
  const prevTodayRef = useRef(today);
  useEffect(() => {
    if (prevTodayRef.current !== today) {
      const prev = prevTodayRef.current;
      prevTodayRef.current = today;
      setSelectedDate((sel) => (sel === prev ? today : sel));
    }
  }, [today]);

  const allIndicators = useMemo(() => allIndicatorsOf(config), [config]);

  const currentRecord = records.find((r) => r.date === selectedDate);
  const todayRecord = records.find((r) => r.date === today);

  useEffect(() => {
    const draft = loadDraft(selectedDate);

    if (currentRecord) {
      setValues(currentRecord.values || {});
      setTags(currentRecord.tags || []);
    } else if (draft) {
      setValues(normalizeRecordValues(draft.values || {}, config));
      setTags(Array.isArray(draft.tags) ? draft.tags : []);
    } else {
      setValues({});
      setTags([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, currentRecord]);

  useEffect(() => {
    if (currentRecord) return;
    const hasContent =
      Object.values(values).some((v) => String(v ?? '').trim() !== '') ||
      tags.length > 0;
    if (!hasContent) return;
    const timer = setTimeout(() => {
      saveDraft(selectedDate, { values, tags });
    }, 300);
    return () => clearTimeout(timer);
  }, [values, tags, selectedDate, currentRecord]);

  const allFilled = allIndicators.every((ind) => {
    const raw = values[ind.id];
    return (
      raw !== undefined &&
      String(raw).trim() !== '' &&
      !Number.isNaN(Number(raw))
    );
  });
  const canSubmit = allIndicators.length > 0 && allFilled;

  const valueState = (ind) => {
    const raw = values[ind.id];
    if (raw === undefined || String(raw).trim() === '' || Number.isNaN(Number(raw))) {
      return null;
    }
    const numeric = Number(raw);
    return ind.type === 'loss' ? numeric <= ind.target : numeric >= ind.target;
  };

  const updateValue = (id, value) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const adjustValue = (id, delta) => {
    setValues((prev) => {
      const current = Number(prev[id]) || 0;
      return { ...prev, [id]: Math.max(current + delta, 0) };
    });
  };

  const toggleTag = (tag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const numericValues = {};
    allIndicators.forEach((ind) => {
      numericValues[ind.id] = Number(values[ind.id]);
    });

    const record = {
      date: selectedDate,
      values: numericValues,
      tags,
      isBackfill: selectedDate !== today
    };

    await saveRecord(record);
    clearDraft(selectedDate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyYesterday = () => {
    const yesterdayRecord = records.find((r) => r.date === addDays(today, -1));
    if (!yesterdayRecord) {
      alert('昨天暂无记录，无法复制');
      return;
    }
    const next = {};
    allIndicators.forEach((ind) => {
      if (yesterdayRecord.values?.[ind.id] !== undefined) {
        next[ind.id] = yesterdayRecord.values[ind.id];
      }
    });
    setValues(next);
    setTags([]);
  };

  const handleQuickTemplate = (template) => {
    setConfig(indicatorsFromTemplate(template, config));
  };

  const suggestion = useMemo(() => generateSuggestion(config, records), [config, records]);

  // “连续 7 天未休息”提醒每 7 天只展示一次，避免天天打扰
  const reminders = useMemo(() => getRestReminders(config, records), [config, records]);
  const [visibleReminders, setVisibleReminders] = useState([]);
  useEffect(() => {
    let lastShown = 0;
    try {
      lastShown = Number(localStorage.getItem(REST_REMINDER_KEY)) || 0;
    } catch (e) {
      // ignore
    }
    const now = Date.now();
    const restReminder = reminders.find((r) => r.includes('连续 7 天'));
    const filtered = reminders.filter(
      (r) => r !== restReminder || now - lastShown > REST_REMINDER_INTERVAL_MS
    );
    if (restReminder && filtered.includes(restReminder)) {
      try {
        localStorage.setItem(REST_REMINDER_KEY, String(now));
      } catch (e) {
        // ignore
      }
    }
    setVisibleReminders(filtered);
  }, [reminders]);

  return (
    <div className="space-y-4 page-fade">
      {todayRecord && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-green-200 bg-green-50/60">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <span className="chip bg-green-100 text-green-700">✓ 已录入</span>
            今日（{today}）训练数据已提交
          </div>
          <Link to="/review" className="btn-secondary">查看复盘 →</Link>
        </div>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">每日数据采集</h2>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="btn-secondary"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(addDays(today, -1))}
              className="btn-secondary"
            >
              昨天
            </button>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {allIndicators.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-5 text-center space-y-3">
            <p className="muted">还没有配置指标。可以前往配置页手动设置，或直接导入一套内置模板开始：</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/config" className="btn-secondary">前往配置页</Link>
              {templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => handleQuickTemplate(template)}
                  className="btn-secondary"
                >
                  导入「{template.name}」
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-gray-100">
            {allIndicators.map((ind) => {
              const ok = valueState(ind);
              return (
                <div key={ind.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {ind.name}
                        <span className="text-xs text-gray-400 ml-1.5">
                          目标 {ind.target}
                          {ind.unit || ''}
                        </span>
                      </div>
                      {ind.note && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{ind.note}</div>
                      )}
                    </div>
                    {ok !== null && (
                      <span
                        className={`chip ${
                          ok ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-600'
                        }`}
                      >
                        {ok ? '达标' : '未达标'}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => adjustValue(ind.id, -10)}
                      className="btn-secondary !px-2 !py-1 text-xs"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustValue(ind.id, -5)}
                      className="btn-secondary !px-2 !py-1 text-xs"
                    >
                      -5
                    </button>
                    <input
                      type="number"
                      step="any"
                      value={values[ind.id] ?? ''}
                      onChange={(e) => updateValue(ind.id, e.target.value)}
                      className="input w-24 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => adjustValue(ind.id, 5)}
                      className="btn-secondary !px-2 !py-1 text-xs"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustValue(ind.id, 10)}
                      className="btn-secondary !px-2 !py-1 text-xs"
                    >
                      +10
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allIndicators.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={copyYesterday} className="btn-secondary">
              复制昨天
            </button>
          </div>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-gray-500">标签（可选）</summary>
          <div className="mt-2 flex flex-wrap gap-4">
            {['正常', '生病', '突发事件'].map((tag) => (
              <label key={tag} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {tag}
              </label>
            ))}
          </div>
        </details>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
            提交
          </button>
          {allIndicators.length === 0 && (
            <span className="text-xs text-gray-400">请先配置指标后再提交</span>
          )}
          {saved && <span className="text-sm text-cyan-600 font-medium">已保存</span>}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="section-title">今日梯度建议</h3>
        <p className="mt-2 text-sm leading-6">{suggestion.text}</p>
      </section>

      {visibleReminders.map((reminder, index) => (
        <div
          key={index}
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800"
        >
          {reminder}
        </div>
      ))}
    </div>
  );
}
