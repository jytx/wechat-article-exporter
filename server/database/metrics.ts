/**
 * 文章指标数据访问层 (SQLite)
 * 存储文章的阅读量/点赞/分享等互动指标，用于热文榜排序
 */

import { getDatabase } from '~/server/utils/database';

export interface ArticleMetric {
  url: string;
  fakeid: string;
  title: string;
  read_num: number;
  old_like_num: number;
  share_num: number;
  like_num: number;
  comment_num: number;
  article_create_time?: number;
  sampled_at?: number;
  // 联表查询出的公众号名称
  account_nickname?: string;
}

export interface RankingQuery {
  fakeids?: string[];
  days?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * 单条指标 UPSERT（以 url 为主键，每次覆盖为最新快照）
 */
export async function upsertMetric(metric: ArticleMetric): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO article_metrics
      (url, fakeid, title, read_num, old_like_num, share_num, like_num, comment_num, article_create_time, sampled_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      metric.url,
      metric.fakeid,
      metric.title,
      metric.read_num || 0,
      metric.old_like_num || 0,
      metric.share_num || 0,
      metric.like_num || 0,
      metric.comment_num || 0,
      metric.article_create_time || null,
      metric.sampled_at || Math.floor(Date.now() / 1000),
    );

    return true;
  } catch (error) {
    console.error('upsertMetric failed:', error);
    return false;
  }
}

/**
 * 批量 UPSERT 指标（事务）
 */
export async function upsertMetrics(metrics: ArticleMetric[]): Promise<number> {
  if (metrics.length === 0) return 0;

  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO article_metrics
      (url, fakeid, title, read_num, old_like_num, share_num, like_num, comment_num, article_create_time, sampled_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    const insertMany = db.transaction((rows: ArticleMetric[]) => {
      for (const m of rows) {
        stmt.run(
          m.url,
          m.fakeid,
          m.title,
          m.read_num || 0,
          m.old_like_num || 0,
          m.share_num || 0,
          m.like_num || 0,
          m.comment_num || 0,
          m.article_create_time || null,
          m.sampled_at || Math.floor(Date.now() / 1000),
        );
      }
    });

    insertMany(metrics);
    return metrics.length;
  } catch (error) {
    console.error('upsertMetrics failed:', error);
    return 0;
  }
}

/**
 * 允许排序的字段白名单（防止 SQL 注入）
 */
const ALLOWED_ORDER_FIELDS = new Set([
  'read_num',
  'old_like_num',
  'share_num',
  'like_num',
  'comment_num',
  'article_create_time',
  'sampled_at',
]);

/**
 * 查询热文榜（支持按公众号/时间范围筛选 + 排序）
 * 会 LEFT JOIN accounts 表带出公众号名称
 */
export async function getMetricsRanking(query: RankingQuery): Promise<{
  items: ArticleMetric[];
  total: number;
}> {
  try {
    const db = getDatabase();
    const where: string[] = [];
    const params: any[] = [];

    if (query.fakeids && query.fakeids.length > 0) {
      const placeholders = query.fakeids.map(() => '?').join(',');
      where.push(`m.fakeid IN (${placeholders})`);
      params.push(...query.fakeids);
    }

    if (query.days && query.days > 0) {
      const cutoff = Math.floor(Date.now() / 1000) - query.days * 86400;
      where.push('(m.article_create_time IS NULL OR m.article_create_time >= ?)');
      params.push(cutoff);
    }

    const orderBy = ALLOWED_ORDER_FIELDS.has(query.orderBy || '')
      ? query.orderBy!
      : 'read_num';
    const order = query.order === 'asc' ? 'ASC' : 'DESC';

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // 先查总数
    const countSql = `SELECT COUNT(*) as total FROM article_metrics m ${whereClause}`;
    const countRow = db.prepare(countSql).get(...params) as { total: number };
    const total = countRow.total;

    // 再查分页数据（带公众号名称）
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const dataSql = `
      SELECT m.*, a.nickname AS account_nickname
      FROM article_metrics m
      LEFT JOIN accounts a ON m.fakeid = a.fakeid
      ${whereClause}
      ORDER BY m.${orderBy} ${order}
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(dataSql)
      .all(...params, limit, offset) as ArticleMetric[];

    return { items: rows, total };
  } catch (error) {
    console.error('getMetricsRanking failed:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 获取单篇文章指标
 */
export async function getMetricByUrl(url: string): Promise<ArticleMetric | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM article_metrics WHERE url = ?');
    const row = stmt.get(url) as any;
    return row || null;
  } catch (error) {
    console.error('getMetricByUrl failed:', error);
    return null;
  }
}

export interface MetricsStats {
  total_articles: number;
  total_accounts: number;
  last_sampled_at: number | null;
}

/**
 * 获取采集状态统计
 */
export async function getMetricsStats(): Promise<MetricsStats> {
  try {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT
          COUNT(*) AS total_articles,
          COUNT(DISTINCT fakeid) AS total_accounts,
          MAX(sampled_at) AS last_sampled_at
        FROM article_metrics`,
      )
      .get() as MetricsStats;

    return {
      total_articles: row.total_articles || 0,
      total_accounts: row.total_accounts || 0,
      last_sampled_at: row.last_sampled_at || null,
    };
  } catch (error) {
    console.error('getMetricsStats failed:', error);
    return { total_articles: 0, total_accounts: 0, last_sampled_at: null };
  }
}
