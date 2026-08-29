import { REGISTRY_KEY } from './indicators';
import { CONFIG_KEY } from './storage';

const DB_NAME = 'selftrainer_db';
const STORE_NAME = 'records';
const DB_VERSION = 2;
const LS_FALLBACK_KEY = 'selftrainer_records_ls_fallback';

let dbPromise = null;
// 一旦 IndexedDB 不可用，本次会话固定降级 localStorage，避免数据写到两边造成分裂
let idbBroken = false;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'date' });
          return;
        }

        // v1 → v2：values 从「指标名为主键」迁移为「指标 id 为主键」
        if (event.oldVersion < 2) {
          const store = event.target.transaction.objectStore(STORE_NAME);
          const nameMap = buildMigrationNameMap();
          const legacyNames = new Set();
          const cursorReq = store.openCursor();

          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) {
              // 无主的历史指标名也登记为确定性 id，后续重新添加同名指标可延续历史
              if (legacyNames.size > 0) {
                try {
                  const registry = JSON.parse(
                    localStorage.getItem(REGISTRY_KEY) || '{}'
                  );
                  legacyNames.forEach((name) => {
                    if (!registry[name]) registry[name] = `legacy:${name}`;
                  });
                  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
                } catch (err) {
                  // ignore
                }
              }
              return;
            }

            const record = cursor.value;
            if (record && record.values && typeof record.values === 'object') {
              const converted = {};
              Object.entries(record.values).forEach(([key, val]) => {
                const num = Number(val);
                if (Number.isNaN(num)) return;
                let id = nameMap[key];
                if (!id) {
                  id = `legacy:${key}`;
                  legacyNames.add(key);
                }
                converted[id] = num;
              });
              cursor.update({ ...record, values: converted });
            }
            cursor.continue();
          };
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

// 迁移辅助：从 localStorage 的注册表与配置中收集 名称 → id 映射
function buildMigrationNameMap() {
  const map = {};
  try {
    const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    Object.entries(registry || {}).forEach(([name, id]) => {
      if (typeof id === 'string') map[name] = id;
    });
  } catch (e) {
    // ignore
  }
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    [...(config?.lossIndicators || []), ...(config?.gainIndicators || [])].forEach((ind) => {
      if (ind?.name && ind?.id) map[ind.name] = ind.id;
    });
  } catch (e) {
    // ignore
  }
  return map;
}

function lsGetAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]');
  } catch {
    return [];
  }
}

function lsPut(record) {
  const all = lsGetAll();
  const idx = all.findIndex((r) => r.date === record.date);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(all));
}

function lsReplaceAll(records) {
  localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(records));
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function idbReplaceAll(db, records) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    records.forEach((record) => store.put(record));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// 修复数据分裂：IndexedDB 恢复可用后，把降级期间写入 localStorage 的记录合并回来
async function healSplitData(db, idbRecords) {
  const raw = localStorage.getItem(LS_FALLBACK_KEY);
  if (!raw) return;
  try {
    const lsRecords = JSON.parse(raw);
    localStorage.removeItem(LS_FALLBACK_KEY);
    if (!Array.isArray(lsRecords) || lsRecords.length === 0) return;

    const byDate = new Map(idbRecords.map((r) => [r.date, r]));
    lsRecords.forEach((r) => {
      if (r?.date && !byDate.has(r.date)) byDate.set(r.date, r);
    });
    const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    await idbReplaceAll(db, merged);

    idbRecords.length = 0;
    merged.forEach((r) => idbRecords.push(r));
  } catch (e) {
    // 合并失败不影响本次读取
  }
}

export async function getAllRecords() {
  if (idbBroken) return lsGetAll();
  try {
    const db = await openDB();
    const records = await idbGetAll(db);
    await healSplitData(db, records);
    return records;
  } catch (e) {
    idbBroken = true;
    return lsGetAll();
  }
}

export async function putRecord(record) {
  if (idbBroken) {
    lsPut(record);
    return;
  }
  try {
    const db = await openDB();
    await idbPut(db, record);
  } catch (e) {
    idbBroken = true;
    lsPut(record);
  }
}

export async function replaceAllRecords(records) {
  if (idbBroken) {
    lsReplaceAll(records);
    return;
  }
  try {
    const db = await openDB();
    await idbReplaceAll(db, records);
  } catch (e) {
    idbBroken = true;
    lsReplaceAll(records);
  }
}
