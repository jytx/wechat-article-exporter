/**
 * AI 选题生成器
 * 通过 OpenAI 兼容协议调用（minimax / deepseek / openai / moonshot 等均可）
 */

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  suggestionCount: number;
  systemPrompt?: string;
  /** 取最近多少天的文章（0=不限时间） */
  articleDays?: number;
  /** 喂给 AI 的最大文章篇数 */
  articleLimit?: number;
}

/** 喂给 AI 的文章素材（公众号文章满足此结构） */
export interface AiArticle {
  title: string;
  link?: string;
  /** 摘要（digest，质量参差，作为正文缺失时的降级） */
  summary?: string;
  /** 来源（公众号名称） */
  source?: string;
  publishedAt?: number;
  /** 纯文本正文（有则用正文，无则降级用 summary） */
  content?: string;
}

/** 单条 AI 选题建议 */
export interface AiSuggestion {
  title: string;
  angle?: string;
  summary?: string;
  keywords?: string[];
  references?: Array<{ title?: string; link?: string; source?: string }>;
}

/** AI 分析的过程追踪信息（供前端「查看分析过程」展示 + 落库） */
export interface AiProcessTrace {
  model: string;
  provider: string;
  systemPrompt: string;
  userMessage: string;
  /** AI 原始返回内容（未解析） */
  rawResponse: string;
  /** 本次调用耗时（毫秒） */
  durationMs: number;
  /** 重试次数（首次为 0） */
  attempts: number;
  promptTokens?: number;
  completionTokens?: number;
}

/** generateTopicSuggestions 的完整返回 */
export interface AiGenerateResult {
  suggestions: AiSuggestion[];
  trace: AiProcessTrace;
}

const DEFAULT_SYSTEM_PROMPT = `你是一位资深的科技内容主编，擅长从最新资讯中发现有传播价值的选题。
你会收到一批最新的公众号文章列表（含标题、摘要、来源公众号）。请你：
1. 通读所有文章，找出其中有内在关联、可形成趋势或值得深挖的话题群；
2. 基于这些话题，构思 {{COUNT}} 个**原创选题建议**（不要直接复制原标题，要提炼出更有传播力的角度）；
3. 每个选题包含：一个吸引人的中文标题、一个切入角度/写作思路、一段简要说明、3-5 个关键词标签；
4. references 字段只能填入**与该选题话题直接相关、构成选题核心依据**的来源文章（通常 2-4 篇），并且必须是这些文章实际在讨论的内容，而不是仅凭某个关键词联想来的。
   - ❌ 错误：选题是「A公司收购B产品」，却把只因为标题含"编程"二字的无关文章塞进 references。
   - ✅ 正确：references 里的每一篇，都应该是这个选题去掉就无法成立的核心素材。
   - 宁缺毋滥：如果某篇只是沾边，就不要放进来。

严格返回如下 JSON（不要包含任何解释文字、不要 markdown 代码块）：
{"suggestions":[{"title":"...","angle":"...","summary":"...","keywords":["..."],"references":[{"title":"...","link":"...","source":"..."}]}]}`;

/** 每篇正文喂给 AI 的最大字符数（控制 token，~2000字≈1200token） */
const CONTENT_CHARS_PER_ARTICLE = 2000;

/** 构造 user message：优先用正文，无正文降级用摘要 */
function buildUserMessage(articles: AiArticle[], limit: number): string {
  const slice = articles.slice(0, limit);
  const lines = slice.map((a, i) => {
    const parts = [`[${i + 1}] ${a.title}`];
    // 优先正文，其次摘要
    const body = a.content
      ? a.content.slice(0, CONTENT_CHARS_PER_ARTICLE)
      : a.summary;
    if (body) {
      parts.push(a.content ? `    正文：${body}` : `    摘要：${body}`);
    }
    if (a.source) parts.push(`    来源：${a.source}`);
    return parts.join('\n');
  });

  // 统计有多少篇带正文，给 AI 一个信号
  const withContent = slice.filter(a => a.content).length;
  const contentHint =
    withContent > 0
      ? `（其中 ${withContent} 篇提供了完整正文，请重点依据正文内容分析）`
      : '（注：以下仅提供摘要，正文尚未抓取，分析质量可能受限）';

  return `以下是最近抓取到的 ${slice.length} 篇公众号文章${contentHint}，请据此生成选题建议：\n\n${lines.join('\n\n')}`;
}

/**
 * 从模型返回内容里解析出 suggestions 数组。
 * 优先用 JSON.parse，失败则用正则兜底提取最外层 {...}
 */
function parseSuggestions(content: string, count: number): AiSuggestion[] {
  let text = content.trim();

  // 去掉可能的 markdown 代码块包裹
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // 尝试直接解析
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 兜底：抽取第一个 {...}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  let list: any[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.suggestions)) {
    list = parsed.suggestions;
  } else if (parsed && Array.isArray(parsed.data)) {
    list = parsed.data;
  }

  const cleaned = list
    .filter(item => item && typeof item === 'object' && typeof item.title === 'string')
    .slice(0, count)
    .map(item => ({
      title: String(item.title),
      angle: item.angle ? String(item.angle) : undefined,
      summary: item.summary ? String(item.summary) : undefined,
      keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : undefined,
      references: Array.isArray(item.references) ? item.references : undefined,
    }));

  return cleaned;
}

/** 调用 OpenAI 兼容的 Chat Completions 接口 */
async function callChatCompletions(
  url: string,
  apiKey: string,
  body: Record<string, any>,
  systemPrompt: string,
  userMessage: string
): Promise<{ content: string; promptTokens?: number; completionTokens?: number; raw: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`AI 接口返回 ${res.status}: ${resText.slice(0, 300)}`);
  }
  let data: any = null;
  try {
    data = JSON.parse(resText);
  } catch {
    throw new Error('AI 返回非 JSON 内容');
  }
  const content: string = data?.choices?.[0]?.message?.content || '';
  return {
    content,
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
    raw: content || resText.slice(0, 1000),
  };
}

/**
 * 调用 MiniMax Responses API（POST /v1/responses）
 * 与 Chat Completions 的差异：
 * - 端点是 /responses，不是 /chat/completions
 * - 请求体用 instructions（system）+ input（user，字符串即可）+ max_output_tokens
 * - 响应有 output_text 便利字段；usage 用 input_tokens/output_tokens
 */
async function callResponsesApi(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ content: string; promptTokens?: number; completionTokens?: number; raw: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input: userMessage,
      temperature: 0.8,
      max_output_tokens: 2048,
    }),
  });
  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`AI 接口返回 ${res.status}: ${resText.slice(0, 300)}`);
  }
  let data: any = null;
  try {
    data = JSON.parse(resText);
  } catch {
    throw new Error('AI 返回非 JSON 内容');
  }

  // 优先用 output_text 便利字段；否则从 output 数组里拼
  let content: string = data?.output_text || '';
  if (!content && Array.isArray(data?.output)) {
    content = data.output
      .flatMap((item: any) => item?.content || [])
      .map((c: any) => c?.text || '')
      .join('');
  }

  return {
    content,
    promptTokens: data?.usage?.input_tokens,
    completionTokens: data?.usage?.output_tokens,
    raw: content || resText.slice(0, 1000),
  };
}

/**
 * 调用 AI 生成选题建议。
 * 按 provider 分流：minimax 走 Responses API，其他走 Chat Completions。
 * 返回选题 + 完整过程追踪（prompt、原始返回、耗时、token、重试次数）。
 * 失败时抛出的 Error 上会挂 trace（含已发送的 prompt），便于上层记录「查看分析过程」。
 */
export async function generateTopicSuggestions(
  config: AiConfig,
  articles: AiArticle[]
): Promise<AiGenerateResult> {
  if (!config.apiKey) {
    throw new Error('未配置 AI API Key，请在「设置 → AI 自动选题」中填写');
  }
  if (articles.length === 0) {
    throw new Error('没有可分析的文章，请先同步公众号文章');
  }

  const count = Math.max(1, Math.min(10, config.suggestionCount || 5));
  const systemPrompt = (config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT).replace(
    '{{COUNT}}',
    String(count)
  );
  const userMessage = buildUserMessage(articles, 40); // 控制输入 token

  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const useResponsesApi = config.provider === 'minimax';
  const endpoint = useResponsesApi ? '/responses' : '/chat/completions';
  const url = `${baseUrl}${endpoint}`;

  // Chat Completions 的请求体（Responses API 在函数内构造）
  const chatBody: Record<string, any> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.8,
    max_tokens: 2048,
  };
  // 不强制传 response_format：部分兼容服务不认该参数会返回 400。
  // system prompt 已明确要求返回纯 JSON，且 parseSuggestions 有正则兜底解析，稳定性有保障。

  // 基础 trace（无论成功失败都可返回已发送的 prompt）
  const baseTrace: AiProcessTrace = {
    model: config.model,
    provider: config.provider,
    systemPrompt,
    userMessage,
    rawResponse: '',
    durationMs: 0,
    attempts: 0,
  };

  let lastError: Error | null = null;
  // 最多重试 2 次（首次 + 1 次重试）
  for (let attempt = 0; attempt < 2; attempt++) {
    baseTrace.attempts = attempt + 1;
    const startedAt = Date.now();
    try {
      const result = useResponsesApi
        ? await callResponsesApi(url, config.apiKey, config.model, systemPrompt, userMessage)
        : await callChatCompletions(url, config.apiKey, chatBody, systemPrompt, userMessage);

      baseTrace.durationMs = Date.now() - startedAt;
      baseTrace.rawResponse = result.raw;
      baseTrace.promptTokens = result.promptTokens;
      baseTrace.completionTokens = result.completionTokens;

      if (!result.content) {
        throw new Error('AI 返回内容为空');
      }

      const suggestions = parseSuggestions(result.content, count);
      if (suggestions.length === 0) {
        throw new Error('AI 返回内容无法解析为选题 JSON');
      }
      return { suggestions, trace: baseTrace };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      baseTrace.durationMs = Date.now() - startedAt;
      // 把已尝试的 trace 挂到 error 上，便于失败时也能查看已发送的 prompt
      (lastError as any).trace = { ...baseTrace };
      // 若是可重试的错误，稍等后重试
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error('AI 生成失败');
}
