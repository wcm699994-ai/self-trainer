/**
 * 指标身份管理
 * 历史数据（record.values）以指标 id 为主键，指标名仅作展示。
 * 通过「名称注册表」保证同一名称始终复用同一 id：
 * 改名、删除后重建、重新导入模板都不会切断历史数据。
 */

export const REGISTRY_KEY = 'selftrainer_indicator_registry_v1';

function readRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore
  }
  return {};
}

function writeRegistry(registry) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch (e) {
    // ignore
  }
}

// 为指标名获取稳定 id：注册表中已存在则复用，否则生成并登记
export function getIdForName(name) {
  const registry = readRegistry();
  if (registry[name]) return registry[name];
  const id = `ind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  registry[name] = id;
  writeRegistry(registry);
  return id;
}

// 显式登记 name → id（改名场景：新名称沿用旧 id）
export function registerNameId(name, id) {
  if (!name || !id) return;
  const registry = readRegistry();
  registry[name] = id;
  writeRegistry(registry);
}

// 导入备份后，用备份配置中的 name→id 关系校准注册表
export function syncRegistryFromConfig(config) {
  const registry = readRegistry();
  allIndicatorsOf(config).forEach((ind) => {
    if (ind.name && ind.id) registry[ind.name] = ind.id;
  });
  writeRegistry(registry);
}

export function buildIndicator({ name, unit, target, weight, note }, existingId) {
  return {
    id: existingId || getIdForName(name),
    name,
    unit: unit || '',
    target: Number(target) || 0,
    weight: Number(weight) || 1,
    note: note || ''
  };
}

// 模板导入：与当前配置同名的指标沿用旧 id，历史数据自动延续
export function indicatorsFromTemplate(template, currentConfig) {
  const idByName = new Map();
  allIndicatorsOf(currentConfig).forEach((ind) => idByName.set(ind.name, ind.id));

  const mapList = (list) =>
    list.map((ind) => buildIndicator(ind, idByName.get(ind.name)));

  return {
    lossIndicators: mapList(template.indicators.loss),
    gainIndicators: mapList(template.indicators.gain)
  };
}

export function allIndicatorsOf(config) {
  return [
    ...(config?.lossIndicators || []).map((ind) => ({ ...ind, type: 'loss' })),
    ...(config?.gainIndicators || []).map((ind) => ({ ...ind, type: 'gain' }))
  ];
}

export function findDuplicateNames(config) {
  const seen = new Set();
  const duplicates = [];
  allIndicatorsOf(config).forEach((ind) => {
    if (seen.has(ind.name)) duplicates.push(ind.name);
    else seen.add(ind.name);
  });
  return duplicates;
}

export function idToNameMap(config) {
  const map = {};
  allIndicatorsOf(config).forEach((ind) => {
    map[ind.id] = ind.name;
  });
  return map;
}

// 兼容旧数据/旧备份（values 以指标名为 key）：统一转换为以指标 id 为 key
export function normalizeRecordValues(values, config) {
  if (!values || typeof values !== 'object') return {};
  const nameToId = {};
  allIndicatorsOf(config).forEach((ind) => {
    nameToId[ind.name] = ind.id;
  });
  const out = {};
  Object.entries(values).forEach(([key, val]) => {
    const num = Number(val);
    if (Number.isNaN(num)) return;
    out[nameToId[key] || key] = num;
  });
  return out;
}
