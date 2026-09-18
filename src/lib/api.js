import { loadApiConfig } from './storage';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
// 官方当前模型名；旧名 deepseek-v4-flash 仅为兼容别名，随时可能下线
const DEEPSEEK_MODEL = 'deepseek-flash';

/**
 * 固定 System Prompt：AI 生成指标专用
 * 严格按照需求规格，包含全部硬性约束
 */
const SYSTEM_PROMPT = `你是 SelfTrainer 的指标设计师。SelfTrainer 把「人」视为一个待训练的行为模型:用户的自律需求是训练目标,指标是每天可观测的损失/奖励信号,基准值是收敛目标,后续调参建议等价于按梯度小步更新。你负责为用户的训练目标设计一套可持续收敛的指标配置,必须严格遵守全部硬性约束,不得自行放宽规则:
【硬性约束】
1. 指标分为两类:损失指标(越小越好,最多3项)、增益指标(越大越好,最多3项),指标总数量不能超过6项。
2. 所有指标统一使用【单日统计口径】,禁止生成周、月累计类指标,禁止出现词汇:每周、每月、7天、3天、一周。
3. 优先使用连续量化数值(时长、数量),尽量避免纯0/1布尔打卡模式;整套指标基准值不允许全部等于0,保证调参算法可以正常运行。
4. 指标名称通俗易懂,适合人工每日记录,禁止设计复杂差值类、难以统计的指标。
5. 严格固定输出格式:每一行格式为 指标名称|单位|目标基准值
6. 输出结构必须分为两块:损失指标:、增益指标:
7. 仅输出指标列表,禁止输出任何多余解释、前言、总结、备注、示例说明。
【习惯养成原则】
1. 基准值遵循「微习惯」策略:设置为稍有挑战但当天可坚持的初始水平,而非理想终态,便于行为模型逐步收敛。例如想早睡,基准设为比现状早30分钟,而不是直接定到理想时间。
2. 每个指标都必须是当天结束就能记录、可量化的行为,避免需要主观估算或事后回忆的模糊指标。
3. 指标之间避免强耦合冲突(如两个指标在时间上互相挤压),方便后续复盘定位冲突。
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
export const REVIEW_SYSTEM_PROMPT = `你是 SelfTrainer 的行为优化复盘工程师。SelfTrainer 把「人」视为一个待训练的行为模型:用户每天提交的单日记录就是训练样本,你的输出是训练日志分析——波动归因相当于损失面分析,指标冲突相当于目标间的正则冲突,调参建议相当于下一步的梯度更新。目标不是短期冲刺,而是让行为习惯稳定、可持续地收敛。

必须遵守以下约束:
1. 仅基于用户提供的单日结构化数据进行分析,禁止自行将单日数据累计为周总量或月总量。
2. 所有归因和判断必须围绕单日指标波动展开,不得使用"周累计""月累计"等口径。
3. 使用中性、技术化语言,不输出道德评判、鸡汤或鼓励性话语。
4. 输出内容应包含三部分:波动归因、指标冲突提示、细化调参建议。
5. 每条调参建议必须具体、可执行,且不突破单日统计口径;建议遵循小步长原则,并注意基准值是否过严导致难以坚持,必要时建议回调基准以维持训练可持续性。
6. 不输出指标配置,只输出复盘分析。
7. 不输出 Markdown 代码块,使用清晰段落描述。`;

/**
 * 调用 DeepSeek Chat Completion
 * @param {Array} messages - 用户消息数组，不含 system
 * @param {string} systemPrompt - 可选 system prompt，默认使用 SYSTEM_PROMPT
 * @param {string} apiKeyOverride - 可选，覆盖 localStorage 中的 apiKey
 * @param {object} options - 可选：timeoutMs 超时毫秒数、retries 重试次数、signal 外部取消信号
 */
export async function chatCompletion(
  messages,
  systemPrompt = SYSTEM_PROMPT,
  apiKeyOverride,
  options = {}
) {
  const { timeoutMs = 12000, retries = 1, signal } = options;
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

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 简单退避后再重试
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', forwardAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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

      if (!response.ok) {
        // 透出服务端错误详情（模型不存在/余额不足/鉴权失败等），便于用户定位
        let detail = '';
        try {
          const errBody = await response.json();
          detail = errBody?.error?.message || '';
        } catch (e) {
          // ignore
        }
        const err = new Error(
          detail ? `HTTP ${response.status}：${detail}` : `HTTP ${response.status}`
        );
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response content');
      }

      return content;
    } catch (error) {
      if (signal?.aborted) {
        lastError = new Error('请求已取消');
        break;
      }
      // 内部超时触发的 AbortError 转译为可读提示
      lastError =
        error?.name === 'AbortError'
          ? new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒），请检查网络后重试`)
          : error;
      // 4xx 客户端错误（模型名错误/鉴权失败/参数非法等）重试无意义，直接退出
      if (
        error?.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        break;
      }
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', forwardAbort);
    }
  }

  if (signal?.aborted) {
    throw new Error('请求已取消');
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
    apiKey,
    { timeoutMs: 10000, retries: 0 }
  );
}
