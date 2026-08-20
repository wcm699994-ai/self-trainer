import { create } from 'zustand';
import {
  loadConfig,
  saveConfig,
  loadApiConfig,
  saveApiConfig,
  createDefaultConfig
} from '../lib/storage';
import { getAllRecords, putRecord, replaceAllRecords } from '../lib/db';

export const useStore = create((set, get) => ({
  config: loadConfig(),
  apiConfig: loadApiConfig(),
  records: [],

  setConfig: (config) => {
    saveConfig(config);
    set({ config });
  },

  setApiConfig: (apiConfig) => {
    saveApiConfig(apiConfig);
    set({ apiConfig });
  },

  loadRecords: async () => {
    const records = await getAllRecords();
    set({ records });
  },

  saveRecord: async (record) => {
    await putRecord(record);
    set((state) => ({
      records: [...state.records.filter((r) => r.date !== record.date), record]
    }));
  },

  importData: async ({ config, records }) => {
    await replaceAllRecords(records);
    saveConfig(config);
    set({ config, records });
  },

  clearAll: async () => {
    await replaceAllRecords([]);
    const defaultConfig = createDefaultConfig();
    saveConfig(defaultConfig);
    localStorage.removeItem('selftrainer_draft_v1');
    set({ config: defaultConfig, records: [] });
  },

  updateIndicatorName: async (oldName, newName) => {
    const records = await getAllRecords();
    const updated = records.map((record) => {
      if (record.values && oldName in record.values) {
        const values = { ...record.values };
        values[newName] = values[oldName];
        delete values[oldName];
        return { ...record, values };
      }
      return record;
    });
    await replaceAllRecords(updated);
    set({ records: updated });
  }
}));
