/**
 * AI 选题数据访问层 (SQLite)
 * 存储由 AI 生成的选题建议，一次生成共享一个 batch_id
 */

import { getDatabase } from '~/server/utils/database';

/** 单条 AI 选题建议 */
export interface AiTopic {
  id?: number;
  batch_id: string;
  title: string;
  angle?: string;
  summary?: string;
  /** 标签 JSON 数组字符串，如 '["AI","硬件"]' */
  keywords?: string;
  /** 来源文章 JSON：[{title, link, source}] */
  references?: string;
  provider?: string;
  created_at?: number;
}

/** 新增选题的入参（不含 batch_id / provider，由调用方注入） */
export interface AiTopicInput {
  title: string;
  angle?: string;
  summary?: string;
  keywords?: string[];
  references?: Array<{ title?: string; link?: string; source?: string }>;
}

/** 批次摘要 */
export interface TopicBatch {
  batch_id: string;
  count: number;
  provider: string;
  created_at: number;
}

/**
 * 批量写入选题（同事务）。provider 记录本次使用的模型。
 */
export async function insertTopics(
  batchId: string,
  items: AiTopicInput[],
  provider: string
): Promise<number> {
  if (items.length === 0) return 0;

  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO ai_topics (batch_id, title, angle, summary, keywords, ref_articles, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows: AiTopicInput[]) => {
      for (const item of rows) {
        stmt.run(
          batchId,
          item.title,
          item.angle || null,
          item.summary || null,
          item.keywords ? JSON.stringify(item.keywords) : null,
          item.references ? JSON.stringify(item.references) : null,
          provider
        );
      }
    });

    insertMany(items);
    return items.length;
  } catch (error) {
    console.error('insertTopics failed:', error);
    return 0;
  }
}

/**
 * 按批次查询选题
 */
export async function getTopicsByBatch(batchId: string): Promise<AiTopic[]> {
  try {
    const db = getDatabase();
    return db
      .prepare(
        `SELECT id, batch_id, title, angle, summary, keywords, ref_articles AS \`references\`, provider, created_at
         FROM ai_topics WHERE batch_id = ? ORDER BY id ASC`
      )
      .all(batchId) as AiTopic[];
  } catch (error) {
    console.error('getTopicsByBatch failed:', error);
    return [];
  }
}

/**
 * 最近的批次列表（分页）
 */
export async function getTopicBatches(
  page: number,
  pageSize: number
): Promise<{ items: TopicBatch[]; total: number }> {
  try {
    const db = getDatabase();
    const offset = (page - 1) * pageSize;

    const totalRow = db
      .prepare('SELECT COUNT(DISTINCT batch_id) AS total FROM ai_topics')
      .get() as { total: number };

    const items = db
      .prepare(
        `SELECT batch_id, COUNT(*) AS count, MIN(provider) AS provider, MIN(created_at) AS created_at
         FROM ai_topics
         GROUP BY batch_id
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset) as TopicBatch[];

    return { items, total: totalRow.total || 0 };
  } catch (error) {
    console.error('getTopicBatches failed:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 按批次分页查选题列表（时间倒序，跨批次）
 */
export async function getRecentTopics(
  page: number,
  pageSize: number
): Promise<{ items: AiTopic[]; total: number }> {
  try {
    const db = getDatabase();
    const offset = (page - 1) * pageSize;

    const totalRow = db.prepare('SELECT COUNT(*) AS total FROM ai_topics').get() as {
      total: number;
    };

    const items = db
      .prepare(
        `SELECT id, batch_id, title, angle, summary, keywords, ref_articles AS \`references\`, provider, created_at
         FROM ai_topics ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset) as AiTopic[];

    return { items, total: totalRow.total || 0 };
  } catch (error) {
    console.error('getRecentTopics failed:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 最近一次生成的时间戳（用于前端展示「上次生成」）
 */
export async function getLastGeneratedAt(): Promise<number | null> {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT MAX(created_at) AS last FROM ai_topics')
      .get() as { last: number | null } | undefined;
    return row?.last ?? null;
  } catch (error) {
    console.error('getLastGeneratedAt failed:', error);
    return null;
  }
}

/**
 * 按 id 批量删除选题（同事务）。返回实际删除的行数。
 */
export async function deleteTopics(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM ai_topics WHERE id IN (${placeholders})`);
    const deleteMany = db.transaction((rowIds: number[]) => stmt.run(...rowIds));
    const result = deleteMany(ids);
    return result.changes || 0;
  } catch (error) {
    console.error('deleteTopics failed:', error);
    return 0;
  }
}

// ============ AI 分析过程记录（ai_topic_runs）============

/** 一次 AI 分析的完整过程记录 */
export interface AiTopicRun {
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

/** 写入/更新一次分析记录（以 batch_id 唯一） */
export async function upsertTopicRun(run: AiTopicRun): Promise<boolean> {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO ai_topic_runs
        (batch_id, provider, model, status, error, system_prompt, user_message,
         raw_response, suggestion_count, input_article_count, duration_ms,
         prompt_tokens, completion_tokens, attempts)
      VALUES (@batch_id, @provider, @model, @status, @error, @system_prompt, @user_message,
              @raw_response, @suggestion_count, @input_article_count, @duration_ms,
              @prompt_tokens, @completion_tokens, @attempts)
      ON CONFLICT(batch_id) DO UPDATE SET
        status=excluded.status,
        error=excluded.error,
        raw_response=excluded.raw_response,
        suggestion_count=excluded.suggestion_count,
        duration_ms=excluded.duration_ms,
        prompt_tokens=excluded.prompt_tokens,
        completion_tokens=excluded.completion_tokens,
        attempts=excluded.attempts
    `).run({
      batch_id: run.batch_id,
      provider: run.provider || null,
      model: run.model || null,
      status: run.status,
      error: run.error || null,
      system_prompt: run.system_prompt || null,
      user_message: run.user_message || null,
      raw_response: run.raw_response || null,
      suggestion_count: run.suggestion_count ?? 0,
      input_article_count: run.input_article_count ?? 0,
      duration_ms: run.duration_ms ?? null,
      prompt_tokens: run.prompt_tokens ?? null,
      completion_tokens: run.completion_tokens ?? null,
      attempts: run.attempts ?? 1,
    });
    return true;
  } catch (error) {
    console.error('upsertTopicRun failed:', error);
    return false;
  }
}

/** 按批次查分析过程记录 */
export async function getTopicRunByBatch(batchId: string): Promise<AiTopicRun | null> {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM ai_topic_runs WHERE batch_id = ?')
      .get(batchId) as AiTopicRun | undefined;
    return row || null;
  } catch (error) {
    console.error('getTopicRunByBatch failed:', error);
    return null;
  }
}
