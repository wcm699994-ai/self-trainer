import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { templates } from '../lib/templates';
import { chatCompletion, testApiConnection } from '../lib/api';
import { todayStr } from '../lib/date';
import {
  allIndicatorsOf,
  buildIndicator,
  findDuplicateNames,
  idToNameMap,
  indicatorsFromTemplate,
  normalizeRecordValues,
  registerNameId
} from '../lib/indicators';

const emptyForm = {
  type: 'loss',
  name: '',
  unit: '',
  target: '',
  weight: '1',
  note: ''
};

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 解析 AI 返回的固定格式指标输出
 * 格式示例：
 * 损失指标:
 * 入睡偏差｜分钟｜0
 * 屏幕使用时长｜小时｜2
 *
 * 增益指标:
 * 专注时长｜小时｜4
 * 运动时长｜分钟｜30
 */
function parseAIIndicatorOutput(content) {
  const clean = content
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
    .trim();

  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean);
  const result = { loss: [], gain: [] };
  let currentType = null;

  for (const line of lines) {
    // 严格匹配区块标题，避免误判含关键词的指标名
    if (/^损失指标[：:]?$/.test(line)) {
      currentType = 'loss';
      continue;
    }
    if (/^增益指标[：:]?$/.test(line)) {
      currentType = 'gain';
      continue;
    }

    if (!currentType) continue;

    const parts = line.split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [name, unit, targetStr] = parts;
      const target = parseFloat(targetStr);
      if (name && !Number.isNaN(target)) {
        result[currentType].push({
          name,
          unit,
          target,
          weight: 1,
          note: ''
        });
      }
    }
  }

  return result;
}

function validateBackup(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('文件不是有效的备份数据');
  }
  if (
    !data.config ||
    !Array.isArray(data.config.lossIndicators) ||
    !Array.isArray(data.config.gainIndicators)
  ) {
    throw new Error('指标配置缺失或格式无效');
  }
  if (!Array.isArray(data.records)) {
    throw new Error('记录数据缺失或格式无效');
  }
  data.records.forEach((record, i) => {
    if (!record || typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      throw new Error(`第 ${i + 1} 条记录的日期无效`);
    }
    if (record.values && typeof record.values !== 'object') {
      throw new Error(`第 ${i + 1} 条记录的数值格式无效`);
    }
  });
}

export default function ConfigPage() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const apiConfig = useStore((s) => s.apiConfig);
  const setApiConfig = useStore((s) => s.setApiConfig);
  const records = useStore((s) => s.records);
  const importData = useStore((s) => s.importData);
  const clearAll = useStore((s) => s.clearAll);

  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [templatePreview, setTemplatePreview] = useState(null);

  const [aiGoal, setAiGoal] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiRaw, setAiRaw] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // API 配置：仅保留 API Key，baseUrl / model 已固定
  const [apiForm, setApiForm] = useState({ apiKey: '' });
  const [testStatus, setTestStatus] = useState('');

  const aiAbortRef = useRef(null);
  useEffect(() => () => aiAbortRef.current?.abort(), []);

  useEffect(() => {
    setApiForm({ apiKey: apiConfig.apiKey || '' });
  }, [apiConfig]);

  const allIndicators = useMemo(() => allIndicatorsOf(config), [config]);

  const hasApiKey = apiForm.apiKey && apiForm.apiKey.trim();

  const saveApi = () => {
    setApiConfig({ apiKey: apiForm.apiKey });
  };

  const handleTestConnection = async () => {
    saveApi();
    setTestStatus('测试中...');
    try {
      await testApiConnection(apiForm.apiKey);
      setTestStatus('连接成功');
    } catch (e) {
      setTestStatus(`连接失败（${e?.message || '未知错误'}）`);
    }
  };

  const handleSubmitIndicator = async (event) => {
    event.preventDefault();

    const name = form.name.trim();
    const target = parseFloat(form.target);
    const weight = parseFloat(form.weight);

    if (!name || Number.isNaN(target) || target < 0) {
      setError('请填写指标名称和有效的非负目标值');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('权重必须为正数');
      return;
    }

    // 重名校验：同名指标会导致数据互相覆盖
    const others = allIndicators.filter((ind) => ind.id !== editId);
    if (others.some((ind) => ind.name === name)) {
      setError(`已存在同名指标「${name}」，请更换名称`);
      return;
    }

    const newIndicator = buildIndicator(
      { name, unit: form.unit.trim(), target, weight, note: form.note.trim() },
      editId || undefined
    );

    if (editId) {
      const oldIndicator = allIndicators.find((ind) => ind.id === editId);
      const renamed = oldIndicator && oldIndicator.name !== name;
      if (renamed) {
        const confirmRename = window.confirm(
          `指标名称由「${oldIndicator.name}」改为「${name}」。历史数据按指标 ID 关联，会自动延续，无需迁移。是否继续？`
        );
        if (!confirmRename) return;
        registerNameId(name, editId);
      }

      const newConfig = { ...config };
      newConfig.lossIndicators = config.lossIndicators.filter((ind) => ind.id !== editId);
      newConfig.gainIndicators = config.gainIndicators.filter((ind) => ind.id !== editId);
      if (form.type === 'loss') newConfig.lossIndicators.push(newIndicator);
      else newConfig.gainIndicators.push(newIndicator);

      if (newConfig.lossIndicators.length + newConfig.gainIndicators.length > 6) {
        setError('总指标数不能超过 6 项');
        return;
      }

      setConfig(newConfig);
    } else {
      const list = form.type === 'loss' ? config.lossIndicators : config.gainIndicators;

      if (list.length >= 3) {
        setError('该类型指标已达上限 3 项');
        return;
      }

      if (config.lossIndicators.length + config.gainIndicators.length >= 6) {
        setError('总指标数不能超过 6 项');
        return;
      }

      const newConfig = { ...config };
      if (form.type === 'loss') {
        newConfig.lossIndicators = [...config.lossIndicators, newIndicator];
      } else {
        newConfig.gainIndicators = [...config.gainIndicators, newIndicator];
      }

      setConfig(newConfig);
    }

    setForm(emptyForm);
    setEditId(null);
    setError('');
  };

  const editIndicator = (indicator) => {
    setEditId(indicator.id);
    setForm({
      type: indicator.type,
      name: indicator.name,
      unit: indicator.unit || '',
      target: indicator.target,
      weight: indicator.weight || '1',
      note: indicator.note || ''
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(emptyForm);
    setError('');
  };

  const removeIndicator = (type, id) => {
    if (!window.confirm('确认删除该指标？其历史数据会保留，重新添加同名指标可自动延续。')) {
      return;
    }
    const newConfig = { ...config };
    if (type === 'loss') {
      newConfig.lossIndicators = config.lossIndicators.filter((ind) => ind.id !== id);
    } else {
      newConfig.gainIndicators = config.gainIndicators.filter((ind) => ind.id !== id);
    }
    setConfig(newConfig);
    if (editId === id) cancelEdit();
  };

  const importTemplate = (template) => {
    const hasExisting =
      (config.lossIndicators?.length || 0) + (config.gainIndicators?.length || 0) > 0;
    if (
      hasExisting &&
      !window.confirm('导入模板将替换当前指标配置（同名指标的历史数据会自动延续），是否继续？')
    ) {
      return;
    }
    setConfig(indicatorsFromTemplate(template, config));
  };

  const handleAIGenerate = async () => {
    if (!aiGoal.trim()) return;

    saveApi();
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    setAiRaw(null);

    try {
      const content = await chatCompletion(
        [
          {
            role: 'user',
            content: aiGoal
          }
        ],
        undefined,
        undefined,
        { timeoutMs: 20000, retries: 1, signal: controller.signal }
      );

      if (controller.signal.aborted) return;
      setAiRaw(content);

      const parsed = parseAIIndicatorOutput(content);

      if (parsed.loss.length === 0 && parsed.gain.length === 0) {
        throw new Error('未能从 AI 返回中解析出指标');
      }

      const candidate = {
        lossIndicators: parsed.loss.slice(0, 3),
        gainIndicators: parsed.gain.slice(0, 3)
      };
      const duplicates = findDuplicateNames(candidate);
      if (duplicates.length > 0) {
        throw new Error(`AI 生成了重名指标：${duplicates.join('、')}`);
      }

      if (controller.signal.aborted) return;
      setAiResult(candidate);
      setAiRaw(null);
    } catch (e) {
      if (!controller.signal.aborted) {
        setAiError(`AI 生成失败：${e?.message || '未知错误'}，请检查 API 配置或网络后重试`);
      }
    } finally {
      if (!controller.signal.aborted) setAiLoading(false);
    }
  };

  const confirmAIResult = () => {
    if (!aiResult) return;
    if (!window.confirm('确认用 AI 生成的指标方案替换当前配置？')) return;

    const loss = aiResult.lossIndicators.map((ind) => buildIndicator(ind));
    const gain = aiResult.gainIndicators.map((ind) => buildIndicator(ind));

    setConfig({ lossIndicators: loss, gainIndicators: gain });

    setAiResult(null);
    setAiGoal('');
    setError('');
  };

  const exportJSON = () => {
    const data = JSON.stringify(
      {
        config,
        records,
        exportedAt: new Date().toISOString()
      },
      null,
      2
    );
    downloadBlob(data, `selftrainer-backup-${todayStr()}.json`, 'application/json');
  };

  const exportCSV = () => {
    // 列 = 当前配置的指标 + 历史记录中出现过的所有指标（含已删除），不丢任何历史数据
    const names = idToNameMap(config);
    const unionIds = [];
    const seen = new Set();
    allIndicators.forEach((ind) => {
      if (!seen.has(ind.id)) {
        seen.add(ind.id);
        unionIds.push(ind.id);
      }
    });
    records.forEach((record) => {
      Object.keys(record.values || {}).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          unionIds.push(key);
        }
      });
    });

    const headerFor = (id) =>
      names[id] || (id.startsWith('legacy:') ? id.slice(7) : id);

    const headers = ['date', ...unionIds.map(headerFor), 'tags', 'isBackfill'];
    const rows = records.map((record) => [
      record.date,
      ...unionIds.map((id) => record.values?.[id] ?? ''),
      (record.tags || []).join(';'),
      record.isBackfill ? '是' : '否'
    ]);

    const csv = '\ufeff' + [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    downloadBlob(csv, `selftrainer-data-${todayStr()}.csv`, 'text/csv;charset=utf-8');
  };

  const handleImportJSON = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      validateBackup(data);

      const normalizedRecords = data.records.map((record) => ({
        date: record.date,
        values: normalizeRecordValues(record.values || {}, data.config),
        tags: Array.isArray(record.tags) ? record.tags : [],
        isBackfill: Boolean(record.isBackfill)
      }));

      const range = normalizedRecords.length
        ? `${normalizedRecords[0].date} ~ ${normalizedRecords[normalizedRecords.length - 1].date}`
        : '（无记录）';

      if (
        window.confirm(
          `将覆盖导入 ${normalizedRecords.length} 条记录（${range}）及备份中的指标配置，当前数据会被替换。是否继续？`
        )
      ) {
        await importData({ config: data.config, records: normalizedRecords });
        alert('导入成功');
      } else if (
        window.confirm(
          '是否改为合并导入？同日期记录以备份文件为准，其余现有记录保留，指标配置以备份文件为准。'
        )
      ) {
        const backupDates = new Set(normalizedRecords.map((r) => r.date));
        const merged = [
          ...records.filter((r) => !backupDates.has(r.date)),
          ...normalizedRecords
        ].sort((a, b) => a.date.localeCompare(b.date));
        await importData({ config: data.config, records: merged });
        alert('合并导入成功');
      }
    } catch (e) {
      alert(`导入失败：${e?.message || '请检查文件格式'}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleReset = async () => {
    if (window.confirm('确认清空所有数据并恢复初始状态？此操作不可恢复。')) {
      await clearAll();
      alert('已重置');
    }
  };

  return (
    <div className="space-y-6 page-fade">
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">指标配置</h2>
          <span className="chip bg-gray-100 text-gray-600">
            {config.lossIndicators?.length || 0} 损失 + {config.gainIndicators?.length || 0} 增益 / 6
          </span>
        </div>
        <p className="mt-1 muted">损失指标与增益指标各最多 3 项，总计不超过 6 项。</p>

        <div className="mt-4 grid gap-4">
          {[
            { key: 'loss', title: '损失指标', hint: '越小越好', list: config.lossIndicators || [] },
            { key: 'gain', title: '增益指标', hint: '越大越好', list: config.gainIndicators || [] }
          ].map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-medium text-gray-700">
                {group.title} <span className="text-xs text-gray-400">（{group.hint}）</span>
                <span className="chip bg-gray-100 text-gray-500 ml-2">{group.list.length}/3</span>
              </h3>
              <div className="mt-2 space-y-2">
                {group.list.map((ind) => (
                  <div
                    key={ind.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors ${
                      editId === ind.id ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:bg-gray-50/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm">
                        <span className="font-medium">{ind.name}</span>
                        <span className="text-gray-500 ml-2">
                          目标 {ind.target}
                          {ind.unit || ''} · 权重 {ind.weight}
                        </span>
                      </div>
                      {ind.note && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{ind.note}</div>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" onClick={() => editIndicator(ind)} className="btn-secondary">
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => removeIndicator(group.key, ind.id)}
                        className="btn-secondary !text-red-600 !border-red-100 hover:!bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {group.list.length === 0 && (
                  <p className="text-xs text-gray-300 px-1">暂无{group.title}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmitIndicator} className="mt-5 rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="input"
            >
              <option value="loss">损失指标（越小越好）</option>
              <option value="gain">增益指标（越大越好）</option>
            </select>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="指标名称"
              className="input flex-1 min-w-[140px]"
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="单位"
              className="input w-20"
            />
            <input
              type="number"
              step="any"
              min="0"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="目标基准值"
              className="input w-28"
            />
            <input
              type="number"
              step="any"
              min="1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="权重"
              className="input w-20"
            />
            <button type="submit" className="btn-primary">
              {editId ? '更新' : '添加'}
            </button>
            {editId && (
              <button type="button" onClick={cancelEdit} className="btn-secondary">
                取消编辑
              </button>
            )}
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="备注（可选，会显示在每日录入页作为采集说明）"
            className="input w-full"
          />
          <p className="text-xs text-gray-400">
            目标值为 0 时仅作记录，建议设置合理基准值以获得有效调参建议；指标名称不可重复。
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>
      </section>

      <section className="card p-4">
        <h2 className="section-title">内置模板</h2>
        <div className="mt-3 grid gap-3">
          {templates.map((template) => (
            <div key={template.key} className="rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50/60">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTemplatePreview(templatePreview === template.key ? null : template.key)}
                    className="btn-secondary"
                  >
                    {templatePreview === template.key ? '收起' : '预览'}
                  </button>
                  <button type="button" onClick={() => importTemplate(template)} className="btn-primary !px-3 !py-1.5">
                    导入
                  </button>
                </div>
              </div>

              {templatePreview === template.key && (
                <div className="mt-3 grid gap-2">
                  <div>
                    <p className="text-xs text-gray-500">损失指标（越小越好）</p>
                    {template.indicators.loss.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                        {ind.note && <p className="text-xs text-gray-400">{ind.note}</p>}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">增益指标（越大越好）</p>
                    {template.indicators.gain.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                        {ind.note && <p className="text-xs text-gray-400">{ind.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {hasApiKey && (
        <section className="card p-4">
          <h2 className="section-title">AI 辅助生成指标</h2>
          <p className="mt-1 muted">用一句大白话描述目标，AI 将生成结构化指标候选方案，确认后生效。</p>
          <div className="mt-3 flex gap-2">
            <input
              value={aiGoal}
              onChange={(e) => setAiGoal(e.target.value)}
              placeholder="例如：我希望每天早睡早起，减少刷手机时间，多运动多看书"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleAIGenerate}
              disabled={aiLoading || !aiGoal.trim()}
              className="btn-primary"
            >
              {aiLoading ? '生成中...' : '生成'}
            </button>
          </div>

          {aiError && (
            <div className="mt-2 text-sm text-red-500">
              {aiError}
              {aiRaw && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-gray-400">查看 AI 原始返回</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 border border-gray-100 p-2 text-xs text-gray-600">
                    {aiRaw}
                  </pre>
                </details>
              )}
            </div>
          )}

          {aiResult && (
            <div className="mt-4">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500">预览指标方案（确认后生效）</p>
                <div className="mt-2 grid gap-2">
                  <div>
                    <p className="text-sm font-medium">损失指标</p>
                    {aiResult.lossIndicators.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium">增益指标</p>
                    {aiResult.gainIndicators.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={confirmAIResult} className="btn-primary mt-3">
                确认导入
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card p-4">
        <h2 className="section-title">API 配置</h2>
        <p className="mt-1 muted">已固定 DeepSeek 官方服务</p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              value={apiForm.apiKey}
              onChange={(e) => setApiForm({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="input mt-1 w-full"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={saveApi} className="btn-primary">
              保存
            </button>
            <button type="button" onClick={handleTestConnection} className="btn-secondary">
              测试连接
            </button>
            {testStatus && <span className="text-sm text-gray-500">{testStatus}</span>}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="section-title">数据备份</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={exportJSON} className="btn-secondary">
            导出 JSON 备份
          </button>
          <label className="btn-secondary cursor-pointer">
            导入 JSON 备份
            <input type="file" accept="application/json" onChange={handleImportJSON} className="hidden" />
          </label>
          <button type="button" onClick={exportCSV} className="btn-secondary">
            导出 CSV
          </button>
          <button type="button" onClick={handleReset} className="btn-danger">
            一键重置
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          CSV 导出包含历史记录中出现过的全部指标列（含已删除指标），不丢数据。
        </p>
      </section>
    </div>
  );
}
