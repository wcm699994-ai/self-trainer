import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { loadDraft, saveDraft, clearDraft } from '../lib/storage';
import { generateSuggestion, getRestReminders } from '../lib/rulesEngine';

function toDateStr(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export default function HomePage() {
  const config = useStore((s) => s.config);
  const records = useStore((s) => s.records);
  const saveRecord = useStore((s) => s.saveRecord);

  const [todayStr, setTodayStr] = useState(() => toDateStr(new Date()));
  const minDate = useMemo(() => addDays(todayStr, -7), [todayStr]);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [values, setValues] = useState({});
  const [tags, setTags] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = toDateStr(new Date());
      setTodayStr((prevToday) => {
        if (prevToday !== newToday) {
          setSelectedDate((prevSelected) => (prevSelected === prevToday ? newToday : prevSelected));
          return newToday;
        }
        return prevToday;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const allIndicators = useMemo(
    () => [
      ...(config.lossIndicators || []).map((ind) => ({ ...ind, type: 'loss' })),
      ...(config.gainIndicators || []).map((ind) => ({ ...ind, type: 'gain' }))
    ],
    [config]
  );

  const currentRecord = records.find((r) => r.date === selectedDate);

  useEffect(() => {
    const draft = loadDraft(selectedDate);

    if (currentRecord) {
      setValues(currentRecord.values || {});
      setTags(currentRecord.tags || []);
    } else if (draft) {
      setValues(draft.values || {});
      setTags(draft.tags || []);
    } else {
      setValues({});
      setTags([]);
    }
  }, [selectedDate, currentRecord]);

  useEffect(() => {
    if (currentRecord) return;
    const timer = setTimeout(() => {
      saveDraft(selectedDate, { values, tags });
    }, 300);
    return () => clearTimeout(timer);
  }, [values, tags, selectedDate, currentRecord]);

  const allFilled = allIndicators.every(
    (ind) =>
      values[ind.name] !== undefined &&
      values[ind.name] !== '' &&
      !Number.isNaN(Number(values[ind.name]))
  );

  const updateValue = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const adjustValue = (name, delta) => {
    setValues((prev) => {
      const current = Number(prev[name]) || 0;
      const next = Math.max(current + delta, 0);
      return { ...prev, [name]: next };
    });
  };

  const toggleTag = (tag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!allFilled) return;

    const numericValues = {};
    allIndicators.forEach((ind) => {
      numericValues[ind.name] = Number(values[ind.name]);
    });

    const record = {
      date: selectedDate,
      values: numericValues,
      tags,
      isBackfill: selectedDate !== todayStr
    };

    await saveRecord(record);
    clearDraft(selectedDate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyYesterday = () => {
    const yesterdayStr = addDays(todayStr, -1);
    const yesterdayRecord = records.find((r) => r.date === yesterdayStr);
    if (yesterdayRecord) {
      setValues(yesterdayRecord.values || {});
      setTags([]);
    } else {
      alert('昨天暂无记录，无法复制');
    }
  };

  const suggestion = useMemo(() => generateSuggestion(config, records), [config, records]);
  const reminders = useMemo(() => getRestReminders(config, records), [config, records]);

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">每日数据采集</h2>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              今天
            </button>
            <button
              onClick={() => setSelectedDate(addDays(todayStr, -1))}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              昨天
            </button>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        {allIndicators.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            请先在配置页设置指标，或导入一套模板后开始训练。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {allIndicators.map((ind) => (
              <div key={ind.id} className="flex items-center gap-2">
                <div className="w-1/3 min-w-[120px]">
                  <span className="text-sm">{ind.name}</span>
                  <span className="text-xs text-gray-400 ml-1">
                    {ind.unit || '单位'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustValue(ind.name, -10)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustValue(ind.name, -5)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  >
                    -5
                  </button>
                  <input
                    type="number"
                    step="any"
                    value={values[ind.name] ?? ''}
                    onChange={(e) => updateValue(ind.name, e.target.value)}
                    className="w-24 border border-gray-200 rounded px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => adjustValue(ind.name, 5)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustValue(ind.name, 10)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  >
                    +10
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={copyYesterday}
            className="text-sm text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
          >
            复制昨天
          </button>
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-gray-500">
            标签（可选）
          </summary>
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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allFilled}
            className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-40"
          >
            提交
          </button>
          {saved && <span className="text-sm text-cyan-600">已保存</span>}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-medium">今日梯度建议</h3>
        <p className="mt-2 text-sm leading-6">{suggestion.text}</p>
      </section>

      {reminders.map((reminder, index) => (
        <div
          key={index}
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700"
        >
          {reminder}
        </div>
      ))}
    </div>
  );
}
