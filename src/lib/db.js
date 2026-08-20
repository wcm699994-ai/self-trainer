const DB_NAME = 'selftrainer_db';
const STORE_NAME = 'records';
const DB_VERSION = 1;
const LS_FALLBACK_KEY = 'selftrainer_records_ls_fallback';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'date' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
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

export async function getAllRecords() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return lsGetAll();
  }
}

export async function putRecord(record) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(record);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    lsPut(record);
  }
}

export async function replaceAllRecords(records) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    lsReplaceAll(records);
  }
}
