const CONFIG_KEY = 'selftrainer_config_v1';
const API_CONFIG_KEY = 'selftrainer_api_config_v1';
const DRAFT_KEY = 'selftrainer_draft_v1';

const FIXED_BASE_URL = 'https://api.deepseek.com/v1';
const FIXED_MODEL = 'deepseek-v4-flash';

export function createDefaultConfig() {
  return {
    lossIndicators: [],
    gainIndicators: []
  };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        Array.isArray(parsed.lossIndicators) &&
        Array.isArray(parsed.gainIndicators)
      ) {
        return parsed;
      }
    }
  } catch (e) {
    // ignore
  }
  return createDefaultConfig();
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadApiConfig() {
  let apiKey = '';
  let needsRewrite = false;

  try {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.apiKey === 'string') {
        apiKey = parsed.apiKey;
      }
      // 检测旧结构，清理残留字段
      if (parsed && (parsed.baseUrl !== undefined || parsed.model !== undefined)) {
        needsRewrite = true;
      }
    } else {
      needsRewrite = true;
    }
  } catch (e) {
    needsRewrite = true;
  }

  const result = {
    apiKey,
    baseUrl: FIXED_BASE_URL,
    model: FIXED_MODEL
  };

  if (needsRewrite) {
    saveApiConfig(result);
  }

  return result;
}

export function saveApiConfig(apiConfig) {
  // 仅持久化 apiKey，baseUrl 和 model 固定不写入
  localStorage.setItem(
    API_CONFIG_KEY,
    JSON.stringify({
      apiKey: apiConfig?.apiKey || ''
    })
  );
}

export function loadDraft(date) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    return all[date] || null;
  } catch (e) {
    return null;
  }
}

export function saveDraft(date, draft) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    all[date] = draft;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch (e) {
    // ignore
  }
}

export function clearDraft(date) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    delete all[date];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch (e) {
    // ignore
  }
}
