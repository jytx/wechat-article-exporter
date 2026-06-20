/**
 * AI 自动选题 Composable
 * 封装选题生成、任务轮询、选题列表、配置读写、测试邮件等 API 调用
 */

import { api } from '~/utils/api-client';

/** 单条 AI 选题建议（来自数据库） */
export interface AiTopic {
  id?: number;
  batch_id: string;
  title: string;
  angle?: string;
  summary?: string;
  keywords?: string; // JSON 数组字符串
  references?: string; // JSON 数组字符串
  provider?: string;
  created_at?: number;
}

/** 选题任务状态（来自内存任务表） */
export interface TopicTask {
  id: string;
  trigger: 'manual' | 'schedule';
  status: 'pending' | 'running' | 'completed' | 'failed';
  phase: 'loading_articles' | 'calling_ai' | 'saving' | 'sending_email' | 'done';
  message: string;
  totalArticles: number;
  suggestionCount: number;
  emailSent: boolean | null;
  failedSources: string[];
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  batchId?: string;
  /** AI 分析过程（calling_ai 阶段及之后有值） */
  trace?: TopicTaskTrace;
}

/** AI 分析过程（实时，挂载在任务上） */
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

/** 分析过程记录（来自数据库 ai_topic_runs） */
export interface TopicRun {
  id?: number;
  batch_id: string;
  provider?: string;
  model?: string;
  status: 'running' | 'success' | 'failed';
  error?: string;
  system_prompt?: string;
  user_message?: string;
  raw_response?: string;
  suggestion_count?: number;
  input_article_count?: number;
  duration_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  attempts?: number;
  created_at?: number;
}

/** GET /topic/run/:batchId 的响应 */
export interface TopicRunDetail {
  found: boolean;
  run?: TopicRun;
  topics?: AiTopic[];
}

export interface TopicListResponse {
  items: AiTopic[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface AiConfigDto {
  provider: string;
  apiKey: string; // 服务端脱敏后为 '********' 或空
  hasApiKey?: boolean;
  baseUrl: string;
  model: string;
  suggestionCount: number;
  systemPrompt?: string;
}

export interface EmailConfigDto {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string; // 服务端脱敏后为 '********' 或空
  hasSmtpPass?: boolean;
  from: string;
  to: string[];
}

export interface TopicScheduleDto {
  enabled: boolean;
  cron: string;
}

export interface TopicConfig {
  aiConfig: AiConfigDto;
  emailConfig: EmailConfigDto;
  topicSchedule: TopicScheduleDto;
}

export interface TopicStatusResponse {
  active: number;
  tasks: TopicTask[];
  lastGeneratedAt: number | null;
}

export function useAiTopicApi() {
  /** 触发生成，返回 taskId */
  async function generate(): Promise<{ taskId: string; alreadyRunning?: boolean }> {
    return api.post('/topic/generate');
  }

  /** 查询任务状态（无 taskId 时返回活跃任务 + 上次生成时间） */
  async function getStatus(taskId?: string): Promise<TopicTask | TopicStatusResponse> {
    return api.get('/topic/status', taskId ? { taskId } : {});
  }

  /** 分页查询选题列表 */
  async function listTopics(params: { page?: number; pageSize?: number; batchId?: string }): Promise<TopicListResponse> {
    return api.get('/topic/list', params);
  }

  /** 读取配置 */
  async function getConfig(): Promise<TopicConfig> {
    return api.get('/topic/config');
  }

  /** 保存配置（部分字段，未传的项不覆盖） */
  async function saveConfig(payload: Partial<TopicConfig>): Promise<{ saved: number }> {
    return api.put('/topic/config', payload);
  }

  /** 发送测试邮件 */
  async function sendTestEmail(emailConfig?: Partial<EmailConfigDto>): Promise<{ ok: boolean; messageId?: string }> {
    return api.post('/topic/test-email', emailConfig ? { emailConfig } : {});
  }

  /** 查询某批次的分析过程详情（prompt/原始返回/选题列表） */
  async function getRunDetail(batchId: string): Promise<TopicRunDetail> {
    return api.get(`/topic/run/${batchId}`);
  }

  /** 批量删除选题 */
  async function deleteTopics(ids: number[]): Promise<{ deleted: number }> {
    return api.post('/topic/delete', { ids });
  }

  return {
    generate,
    getStatus,
    listTopics,
    getConfig,
    saveConfig,
    sendTestEmail,
    getRunDetail,
    deleteTopics,
  };
}
