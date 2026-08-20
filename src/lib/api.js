import { loadApiConfig } from './storage';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

/**
 * 固定 System Prompt：AI 生成指标专用
 * 严格按照需求规格，包含全部硬性约束
 */
const SYSTEM_PROMPT = `你需要为 SelfTrainer 自律优化工具生成合规指标配置,必须严格遵守全部硬性约束,不得自行放宽规则:
【硬性约束】
1. 指标分为两类:损失指标(越小越好,最多3项)、增益指标(越大越好,最多3项),指标总数量不能超过6项。
2. 所有指标统一使用【单日统计口径】,禁止生成周、月累计类指标,禁止出现词汇:每周、每月、7天、3天、一周。
3. 优先使用连续量化数值(时长、数量),尽量避免纯0/1布尔打卡模式;整套指标基准值不允许全部等于0,保证调参算法可以正常运行。
4. 指标名称通俗易懂,适合人工每日记录,禁止设计复杂差值类、难以统计的指标。
5. 严格固定输出格式:每一行格式为 指标名称|单位|目标基准值
6. 输出结构必须分为两块:损失指标:、增益指标:
7. 仅输出指标列表,禁止输出任何多余解释、前言、总结、备注、示例说明。
【输出正确范例,仅作格式参考,不要直接复用范例内容】
损失指标:
熬夜时长|h|0
娱乐手机时长|h|1.5
焦虑内耗时长|min|5
增益指标:
早起完成次数|次|1
有效学习时长|h|5
运动时长|min|30
用户接下来会输入自身自律需求,你根据需求生成符合规则的指标配置。`;

/**
 * 固定 Review System Prompt：AI 深度复盘专用
 */
export const REVIEW_SYSTEM_PROMPT = `你是 SelfTrainer 的行为优化复盘助手。基于用户提供的结构化单日数据，输出波动归因、指标冲突提示、细化调参建议。

必须遵守以下约束：
1. 仅基于用户提供的单日结构化数据进行分析，禁止自行将单日数据累计为周总量或月总量。
2. 所有归因和判断必须围绕单日指标波动展开，不得使用"周累计""月累计"等口径。
3. 使用中性、技术化语言，不输出道德评判、鸡汤或鼓励性话语。
4. 输出内容应包含三部分：波动归因、指标冲突提示、细化调参建议。
5. 每条调参建议必须具体、可执行，且不突破单日统计口径。
6. 不输出指标配置，只输出复盘分析。
7. 不输出 Markdown 代码块，使用清晰段落描述。`;

/**
 * 调用 DeepSeek Chat Completion
 * @param {Array} messages - 用户消息数组，不含 system
 * @param {string} systemPrompt - 可选 system prompt，默认使用 SYSTEM_PROMPT
 * @param {string} apiKeyOverride - 可选，覆盖 localStorage 中的 apiKey
 */
export async function chatCompletion(
  messages,
  systemPrompt = SYSTEM_PROMPT,
  apiKeyOverride
) {
  const config = loadApiConfig();
  const apiKey = apiKeyOverride || config.apiKey;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('API Key 未配置');
  }

  const body = {
    model: DEEPSEEK_MODEL,
    temperature: 0.2,
    stream: false,
    thinking: {
      type: 'disabled'
    },
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      ...messages
    ]
  };

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response content');
      }

      return content;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }
  }

  throw lastError || new Error('AI 请求失败');
}

/**
 * 测试 DeepSeek 连接
 * 硬编码 DeepSeek 端点和模型，显式传入 apiKey 避免竞态
 */
export async function testApiConnection(apiKey) {
  await chatCompletion(
    [
      {
        role: 'user',
        content: '连接测试'
      }
    ],
    SYSTEM_PROMPT,
    apiKey
  );
}
