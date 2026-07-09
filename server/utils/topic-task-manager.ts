/**
 * AI 选题任务管理器（内存态，fire-and-forget）
 *
 * 模式与 sync-task-manager 一致：
 * 前端/定时触发 → 立即返回 taskId → 服务端后台跑 RSS→AI→落库→邮件
 * → 前端轮询 /topic/status 查询进度
 *
 * 任务状态存在内存中，服务重启后丢失（但已落库的选题不会丢）。
 * 选题任务不依赖微信登录态，配置全部从 settings 表读取。
 */

import { getAllSettings } from '~/server/database/settings';
import {
  insertTopics,
  getLastGeneratedAt,
  upsertTopicRun,
  type AiTopicRun,
} from '~/server/database/topic';
import { getRecentArticlesForTopic, type Article } from '~/server/database/article';
import { getContentsByUrls } from '~/server/database/article-content';
import {
  generateTopicSuggestions,
  type AiConfig,
  type AiSuggestion,
  type AiProcessTrace,
  type AiArticle,
} from './ai-provider';
import { sendTopicEmail, type EmailConfig } from './email-sender';

/** AI 分析过程（实时挂载在任务上，供前端进度条点击查看） */
export interface TopicTaskTrace {
  model?: string;
  provider?: string;
  systemPrompt?: string;
  userMessage?: string;
  rawResponse?: string;
  durationMs?: number;
  attempts?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface TopicTask {
  id: string;
  trigger: 'manual' | 'schedule';
  status: 'pending' | 'running' | 'completed' | 'failed';
  phase: 'loading_articles' | 'calling_ai' | 'saving' | 'sending_email' | 'done';
  message: string;
  totalArticles: number;
  suggestionCount: number;
  emailSent: boolean | null; // null=未尝试/未启用, true=成功, false=失败
  failedSources: string[];
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  /** 生成完成后指向本次 batch_id，便于前端跳转查看 */
  batchId?: string;
  /** AI 分析过程（仅 calling_ai 阶段及之后有值） */
  trace?: TopicTaskTrace;
}

// 内存任务表
const tasks = new Map<string, TopicTask>();

// 自动清理超过 30 分钟的已完成任务
const TASK_TTL_MS = 30 * 60 * 1000;

function cleanupOldTasks() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (
      (task.status === 'completed' || task.status === 'failed') &&
      task.finishedAt &&
      now - task.finishedAt > TASK_TTL_MS
    ) {
      tasks.delete(id);
    }
  }
}

export function getTopicTask(taskId: string): TopicTask | undefined {
  cleanupOldTasks();
  return tasks.get(taskId);
}

export function getActiveTopicTasks(): TopicTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).filter(t => t.status === 'running' || t.status === 'pending');
}

export function getAllTopicTasks(): TopicTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
}

/** 解析 settings 中的 ai_config / email_config JSON */
function readConfigs(settings: Record<string, string>) {
  const safeParse = <T>(s: string | undefined, fallback: T): T => {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  };

  const aiConfig = safeParse<Partial<AiConfig>>(settings.ai_config, {});
  const emailConfig = safeParse<Partial<EmailConfig>>(settings.email_config, {});

  return { aiConfig, emailConfig };
}

/**
 * 启动一个选题生成任务，立即返回 taskId。
 * 若已有任务在跑则返回那个任务的 id（幂等）。
 */
export function startTopicTask(trigger: 'manual' | 'schedule' = 'manual'): string {
  cleanupOldTasks();

  // 幂等：同一时刻只允许一个选题任务
  const active = getActiveTopicTasks();
  if (active.length > 0) {
    return active[0].id;
  }

  const taskId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: TopicTask = {
    id: taskId,
    trigger,
    status: 'running',
    phase: 'loading_articles',
    message: '开始加载公众号文章...',
    totalArticles: 0,
    suggestionCount: 0,
    emailSent: null,
    failedSources: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  tasks.set(taskId, task);

  // fire-and-forget
  void runTopicLoop(taskId);

  return taskId;
}

async function runTopicLoop(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  const fail = (msg: string, run?: Partial<AiTopicRun>) => {
    task.status = 'failed';
    task.error = msg;
    task.message = `失败：${msg}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    console.error(`[topic-task ${taskId}] 失败: ${msg}`);
    // 失败也落库 run 记录（若有 batchId），便于回看分析过程
    if (run?.batch_id) {
      void upsertTopicRun({
        ...run,
        status: 'failed',
        error: msg,
      } as AiTopicRun);
    }
  };

  const touch = (message?: string) => {
    if (message) task.message = message;
    task.updatedAt = Date.now();
  };

  // 提前生成 batchId，便于 AI 调用失败时也能落库 run 记录
  const batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  task.batchId = batchId;

  try {
    // 1. 读取配置
    const settings = getAllSettings();
    const { aiConfig, emailConfig } = readConfigs(settings);

    if (!aiConfig.apiKey) {
      fail('未配置 AI API Key');
      return;
    }

    // 2. 加载已同步的公众号文章（按配置的时间范围 + 数量上限，跨公众号、按时间倒序）
    task.phase = 'loading_articles';
    const articleDays = aiConfig.articleDays ?? 7;
    const articleLimit = aiConfig.articleLimit ?? 50;
    const daysHint = articleDays > 0 ? `最近 ${articleDays} 天的` : '全部';
    touch(`正在加载${daysHint}公众号文章...`);
    console.log(`[topic-task ${taskId}] 加载公众号文章（days=${articleDays}, limit=${articleLimit}）`);

    const dbArticles = await getRecentArticlesForTopic(articleLimit, articleDays);
    task.totalArticles = dbArticles.length;

    if (dbArticles.length === 0) {
      fail(articleDays > 0 ? `最近 ${articleDays} 天没有已同步的文章，请先同步或扩大时间范围` : '没有已同步的公众号文章，请先在「公众号管理」同步文章');
      return;
    }

    // 映射成 AI 分析所需的结构
    const articles: AiArticle[] = dbArticles.map((a: Article) => ({
      title: a.title,
      link: a.link,
      summary: a.digest || undefined,
      source: a.account_nickname || undefined,
      publishedAt: a.create_time,
    }));

    // 批量加载已抓取的纯文本正文（有正文的文章优先用正文，没有的降级用摘要）
    touch(`已加载 ${articles.length} 篇文章，正在读取正文...`);
    const urls = articles.map(a => a.link).filter(Boolean) as string[];
    const contentMap = await getContentsByUrls(urls);
    let withContent = 0;
    for (const a of articles) {
      if (a.link && contentMap.has(a.link)) {
        a.content = contentMap.get(a.link);
        if (a.content) withContent++;
      }
    }

    const contentHint =
      withContent > 0
        ? `（${withContent}/${articles.length} 篇有正文）`
        : '（无正文，建议先点「补抓文章正文」）';
    touch(`已加载 ${articles.length} 篇文章${contentHint}，正在调用 AI 分析...`);
    console.log(`[topic-task ${taskId}] ${withContent}/${articles.length} 篇有正文`);

    // 3. 调用 AI
    task.phase = 'calling_ai';
    const fullAiConfig: AiConfig = {
      provider: aiConfig.provider || 'deepseek',
      apiKey: aiConfig.apiKey,
      baseUrl: aiConfig.baseUrl || 'https://api.deepseek.com/v1',
      model: aiConfig.model || 'deepseek-chat',
      suggestionCount: aiConfig.suggestionCount || 5,
      systemPrompt: aiConfig.systemPrompt,
      articleDays,
      articleLimit,
    };

    const { suggestions, trace } = await generateTopicSuggestions(fullAiConfig, articles);
    // 实时挂载 trace 到任务，前端进度条可立即查看
    task.trace = trace;
    task.suggestionCount = suggestions.length;
    touch(`AI 生成了 ${suggestions.length} 个选题（${trace.attempts} 次尝试，${(trace.durationMs / 1000).toFixed(1)}s），正在保存...`);
    console.log(`[topic-task ${taskId}] AI 生成 ${suggestions.length} 个选题`);

    // 4. 落库选题
    task.phase = 'saving';
    const inserted = await insertTopics(batchId, suggestions, fullAiConfig.model);

    if (inserted === 0) {
      fail('选题保存失败', {
        batch_id: batchId,
        provider: trace.provider,
        model: trace.model,
        system_prompt: trace.systemPrompt,
        user_message: trace.userMessage,
        raw_response: trace.rawResponse,
        suggestion_count: suggestions.length,
        input_article_count: articles.length,
        duration_ms: trace.durationMs,
        prompt_tokens: trace.promptTokens,
        completion_tokens: trace.completionTokens,
        attempts: trace.attempts,
      });
      return;
    }

    // 落库分析过程记录（成功）
    await upsertTopicRun({
      batch_id: batchId,
      provider: trace.provider,
      model: trace.model,
      status: 'success',
      system_prompt: trace.systemPrompt,
      user_message: trace.userMessage,
      raw_response: trace.rawResponse,
      suggestion_count: suggestions.length,
      input_article_count: articles.length,
      duration_ms: trace.durationMs,
      prompt_tokens: trace.promptTokens,
      completion_tokens: trace.completionTokens,
      attempts: trace.attempts,
    });

    // 5. 发邮件（若启用）
    if (emailConfig.enabled) {
      task.phase = 'sending_email';
      task.emailSent = null;
      touch('正在发送选题邮件...');
      const fullEmailConfig: EmailConfig = {
        enabled: true,
        smtpHost: emailConfig.smtpHost || '',
        smtpPort: emailConfig.smtpPort || 465,
        smtpSecure: emailConfig.smtpSecure ?? true,
        smtpUser: emailConfig.smtpUser || '',
        smtpPass: emailConfig.smtpPass || '',
        from: emailConfig.from || '',
        to: emailConfig.to || [],
      };
      const result = await sendTopicEmail(fullEmailConfig, suggestions);
      task.emailSent = result.ok;
      if (!result.ok) {
        console.error(`[topic-task ${taskId}] 邮件发送失败: ${result.error}`);
      }
    }

    // 6. 完成
    task.status = 'completed';
    task.phase = 'done';
    const emailHint =
      task.emailSent === true
        ? '，邮件已发送'
        : task.emailSent === false
          ? '，邮件发送失败'
          : '';
    task.message = `完成：生成 ${suggestions.length} 个选题${emailHint}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    console.log(`[topic-task ${taskId}] 完成，batchId=${batchId}`);
  } catch (err) {
    // 失败时若 error 上挂了 trace（来自 ai-provider），也挂到任务上供查看
    const traceOnErr = (err as any)?.trace as AiProcessTrace | undefined;
    if (traceOnErr) {
      task.trace = traceOnErr;
    }
    fail(err instanceof Error ? err.message : String(err), traceOnErr
      ? {
          batch_id: batchId,
          provider: traceOnErr.provider,
          model: traceOnErr.model,
          system_prompt: traceOnErr.systemPrompt,
          user_message: traceOnErr.userMessage,
          raw_response: traceOnErr.rawResponse,
          input_article_count: task.totalArticles,
          duration_ms: traceOnErr.durationMs,
          prompt_tokens: traceOnErr.promptTokens,
          completion_tokens: traceOnErr.completionTokens,
          attempts: traceOnErr.attempts,
        }
      : undefined);
  }
}

/**
 * 供前端展示「上次生成时间」（取自数据库，非内存任务）
 */
export async function getLastGeneratedTime(): Promise<number | null> {
  return getLastGeneratedAt();
}
