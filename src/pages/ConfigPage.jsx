import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { templates } from '../lib/templates';
import { chatCompletion, testApiConnection } from '../lib/api';

const emptyForm = {
  type: 'loss',
  name: '',
  unit: '',
  target: '',
  weight: '1'
};

function toDateStr(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

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

export default function ConfigPage() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const apiConfig = useStore((s) => s.apiConfig);
  const setApiConfig = useStore((s) => s.setApiConfig);
  const records = useStore((s) => s.records);
  const importData = useStore((s) => s.importData);
  const clearAll = useStore((s) => s.clearAll);
  const updateIndicatorName = useStore((s) => s.updateIndicatorName);

  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [templatePreview, setTemplatePreview] = useState(null);

  const [aiGoal, setAiGoal] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // API 配置：仅保留 API Key，baseUrl / model 已固定
  const [apiForm, setApiForm] = useState({ apiKey: '' });
  const [testStatus, setTestStatus] = useState('');

  useEffect(() => {
    setApiForm({ apiKey: apiConfig.apiKey || '' });
  }, [apiConfig]);

  const allIndicators = useMemo(
    () => [...(config.lossIndicators || []), ...(config.gainIndicators || [])],
    [config]
  );

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
      setTestStatus('连接失败');
    }
  };

  const handleSubmitIndicator = async (event) => {
    event.preventDefault();

    const target = parseFloat(form.target);
    const weight = parseFloat(form.weight) || 1;

    if (!form.name.trim() || Number.isNaN(target)) {
      setError('请填写指标名称和有效目标值');
      return;
    }

    const newIndicator = {
      id: editId || `ind_${Date.now()}_${Math.random()}`,
      name: form.name.trim(),
      unit: form.unit.trim(),
      target,
      weight
    };

    if (editId) {
      const oldIndicator =
        config.lossIndicators.find((ind) => ind.id === editId) ||
        config.gainIndicators.find((ind) => ind.id === editId);

      const newConfig = { ...config };
      newConfig.lossIndicators = config.lossIndicators.filter((ind) => ind.id !== editId);
      newConfig.gainIndicators = config.gainIndicators.filter((ind) => ind.id !== editId);

      const targetList =
        form.type === 'loss' ? newConfig.lossIndicators : newConfig.gainIndicators;

      if (targetList.length >= 3) {
        setError('该类型指标已达上限 3 项');
        return;
      }

      targetList.push(newIndicator);

      if (newConfig.lossIndicators.length + newConfig.gainIndicators.length > 6) {
        setError('总指标数不能超过 6 项');
        return;
      }

      if (oldIndicator && oldIndicator.name !== newIndicator.name) {
        const confirmMigrate = window.confirm(
          `指标名称由「${oldIndicator.name}」改为「${newIndicator.name}」，将自动迁移所有历史数据中的对应数值。是否继续？`
        );
        if (!confirmMigrate) return;
        await updateIndicatorName(oldIndicator.name, newIndicator.name);
      }

      setConfig(newConfig);
    } else {
      const list =
        form.type === 'loss'
          ? config.lossIndicators
          : config.gainIndicators;

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

  const editIndicator = (indicator, type) => {
    setEditId(indicator.id);
    setForm({
      type,
      name: indicator.name,
      unit: indicator.unit || '',
      target: indicator.target,
      weight: indicator.weight || '1'
    });
  };

  const removeIndicator = (type, id) => {
    const newConfig = { ...config };
    if (type === 'loss') {
      newConfig.lossIndicators = config.lossIndicators.filter((ind) => ind.id !== id);
    } else {
      newConfig.gainIndicators = config.gainIndicators.filter((ind) => ind.id !== id);
    }
    setConfig(newConfig);
  };

  const importTemplate = (template) => {
    const newConfig = {
      lossIndicators: template.indicators.loss.map((ind) => ({
        ...ind,
        id: `tpl_${Date.now()}_${Math.random()}`
      })),
      gainIndicators: template.indicators.gain.map((ind) => ({
        ...ind,
        id: `tpl_${Date.now()}_${Math.random()}`
      }))
    };
    setConfig(newConfig);
  };

  const handleAIGenerate = async () => {
    if (!aiGoal.trim()) return;

    saveApi();
    setAiLoading(true);
    setAiError('');
    setAiResult(null);

    try {
      const content = await chatCompletion([
        {
          role: 'user',
          content: aiGoal
        }
      ]);

      const parsed = parseAIIndicatorOutput(content);

      if (parsed.loss.length === 0 && parsed.gain.length === 0) {
        throw new Error('格式错误');
      }

      setAiResult({
        loss: parsed.loss.slice(0, 3),
        gain: parsed.gain.slice(0, 3)
      });
    } catch (e) {
      setAiError('AI 生成失败，请检查 API 配置或网络后重试');
    } finally {
      setAiLoading(false);
    }
  };

  const confirmAIResult = () => {
    if (!aiResult) return;

    const loss = aiResult.loss.slice(0, 3).map((ind) => ({
      ...ind,
      id: `ai_${Date.now()}_${Math.random()}`
    }));

    const gain = aiResult.gain.slice(0, 3).map((ind) => ({
      ...ind,
      id: `ai_${Date.now()}_${Math.random()}`
    }));

    setConfig({
      lossIndicators: loss,
      gainIndicators: gain
    });

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
    downloadBlob(data, `selftrainer-backup-${toDateStr(new Date())}.json`, 'application/json');
  };

  const exportCSV = () => {
    const headers = ['date', ...allIndicators.map((ind) => ind.name), 'tags', 'isBackfill'];
    const rows = records.map((record) => [
      record.date,
      ...allIndicators.map((ind) => record.values?.[ind.name] ?? ''),
      (record.tags || []).join(';'),
      record.isBackfill ? '是' : '否'
    ]);

    const csv = '\ufeff' + [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    downloadBlob(csv, `selftrainer-data-${toDateStr(new Date())}.csv`, 'text/csv;charset=utf-8');
  };

  const handleImportJSON = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.config || !Array.isArray(data.records)) {
        throw new Error('文件格式无效');
      }

      await importData({ config: data.config, records: data.records });
      alert('导入成功');
    } catch (e) {
      alert('导入失败，请检查文件格式');
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
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">指标配置</h2>
        <p className="mt-1 text-sm text-gray-500">
          损失指标与增益指标各最多 3 项，总计不超过 6 项。
        </p>

        <div className="mt-4 grid gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">
              损失指标 <span className="text-xs text-gray-400">（越小越好）</span>
            </h3>
            <div className="mt-2 space-y-2">
              {(config.lossIndicators || []).map((ind) => (
                <div
                  key={ind.id}
                  className="flex items-center justify-between rounded border border-gray-200 p-2"
                >
                  <div className="text-sm">
                    <span className="font-medium">{ind.name}</span>
                    <span className="text-gray-500 ml-2">
                      目标 {ind.target}
                      {ind.unit || ''} · 权重 {ind.weight}
                    </span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => editIndicator(ind, 'loss')}>编辑</button>
                    <button onClick={() => removeIndicator('loss', ind.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">
              增益指标 <span className="text-xs text-gray-400">（越大越好）</span>
            </h3>
            <div className="mt-2 space-y-2">
              {(config.gainIndicators || []).map((ind) => (
                <div
                  key={ind.id}
                  className="flex items-center justify-between rounded border border-gray-200 p-2"
                >
                  <div className="text-sm">
                    <span className="font-medium">{ind.name}</span>
                    <span className="text-gray-500 ml-2">
                      目标 {ind.target}
                      {ind.unit || ''} · 权重 {ind.weight}
                    </span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => editIndicator(ind, 'gain')}>编辑</button>
                    <button onClick={() => removeIndicator('gain', ind.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmitIndicator} className="mt-4 grid gap-2">
          <div className="flex flex-wrap gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="border border-gray-200 rounded px-2 py-1 text-sm"
            >
              <option value="loss">损失指标（越小越好）</option>
              <option value="gain">增益指标（越大越好）</option>
            </select>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="指标名称"
              className="border border-gray-200 rounded px-2 py-1 text-sm flex-1"
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="单位"
              className="border border-gray-200 rounded px-2 py-1 text-sm w-24"
            />
            <input
              type="number"
              step="any"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="目标基准值"
              className="border border-gray-200 rounded px-2 py-1 text-sm w-32"
            />
            <span className="text-xs text-gray-400 self-center shrink-0">
              目标值为0时仅作记录，建议设置合理基准值以获得有效调参建议
            </span>
            <input
              type="number"
              step="any"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="权重"
              className="border border-gray-200 rounded px-2 py-1 text-sm w-20"
            />
            <button
              type="submit"
              className="bg-gray-900 text-white px-3 py-1 rounded text-sm"
            >
              {editId ? '更新' : '添加'}
            </button>
          </div>
          {error && <p className="text-sm text-gray-500">{error}</p>}
        </form>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">内置模板</h2>
        <div className="mt-3 grid gap-3">
          {templates.map((template) => (
            <div key={template.key} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => setTemplatePreview(templatePreview === template.key ? null : template.key)}>
                    {templatePreview === template.key ? '收起' : '预览'}
                  </button>
                  <button onClick={() => importTemplate(template)}>导入</button>
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
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-medium">AI 辅助生成指标</h2>
          <p className="mt-1 text-sm text-gray-500">
            用一句大白话描述目标，AI 将生成结构化指标候选方案，确认后生效。
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={aiGoal}
              onChange={(e) => setAiGoal(e.target.value)}
              placeholder="例如：我希望每天早睡早起，减少刷手机时间，多运动多看书"
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={handleAIGenerate}
              disabled={aiLoading || !aiGoal.trim()}
              className="bg-gray-900 text-white px-3 py-1 rounded text-sm disabled:opacity-40"
            >
              {aiLoading ? '生成中...' : '生成'}
            </button>
          </div>

          {aiError && <p className="mt-2 text-sm text-gray-500">{aiError}</p>}

          {aiResult && (
            <div className="mt-4">
              <div className="rounded border border-gray-200 p-3">
                <p className="text-xs text-gray-500">预览指标方案（确认后生效）</p>
                <div className="mt-2 grid gap-2">
                  <div>
                    <p className="text-sm font-medium">损失指标</p>
                    {aiResult.loss.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium">增益指标</p>
                    {aiResult.gain.map((ind, index) => (
                      <div key={index} className="text-sm mt-1">
                        {ind.name} · 目标 {ind.target}
                        {ind.unit || ''} · 权重 {ind.weight}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={confirmAIResult}
                className="mt-3 bg-gray-900 text-white px-3 py-1 rounded text-sm"
              >
                确认导入
              </button>
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">API 配置</h2>
        <p className="mt-1 text-sm text-gray-500">
          已固定 DeepSeek 官方服务
        </p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="block text-sm text-gray-600">API Key</label>
            <input
              type="password"
              value={apiForm.apiKey}
              onChange={(e) => setApiForm({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveApi}
              className="bg-gray-900 text-white px-3 py-1 rounded text-sm"
            >
              保存
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              className="border border-gray-200 px-3 py-1 rounded text-sm"
            >
              测试连接
            </button>
            {testStatus && <span className="text-sm text-gray-500">{testStatus}</span>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">数据备份</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportJSON}
            className="border border-gray-200 px-3 py-1 rounded text-sm"
          >
            导出 JSON 备份
          </button>
          <label className="border border-gray-200 px-3 py-1 rounded text-sm cursor-pointer">
            导入 JSON 备份
            <input type="file" accept="application/json" onChange={handleImportJSON} className="hidden" />
          </label>
          <button
            type="button"
            onClick={exportCSV}
            className="border border-gray-200 px-3 py-1 rounded text-sm"
          >
            导出 CSV
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="border border-red-200 text-red-600 px-3 py-1 rounded text-sm"
          >
            一键重置
          </button>
        </div>
      </section>
    </div>
  );
}
