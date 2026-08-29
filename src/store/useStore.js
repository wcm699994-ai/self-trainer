import { create } from 'zustand';
import {
  loadConfig,
  saveConfig,
  loadApiConfig,
  saveApiConfig,
  createDefaultConfig,
  clearAllDrafts
} from '../lib/storage';
import { getAllRecords, putRecord, replaceAllRecords } from '../lib/db';
import { syncRegistryFromConfig } from '../lib/indicators';

export const useStore = create((set, get) => ({
  config: loadConfig(),
  apiConfig: loadApiConfig(),
  records: [],

  setConfig: (config) => {
    saveConfig(config);
    syncRegistryFromConfig(config);
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
    syncRegistryFromConfig(config);
    set({ config, records });
  },

  clearAll: async () => {
    await replaceAllRecords([]);
    const defaultConfig = createDefaultConfig();
    saveConfig(defaultConfig);
    clearAllDrafts();
    set({ config: defaultConfig, records: [] });
  }
}));
