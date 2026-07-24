/**
 * 文章纯文本正文 数据访问层
 * 存储 cheerio 从原始 HTML 提取的纯文本，供 AI 选题读取
 */

import * as cheerio from 'cheerio';
import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

export interface ArticleContent {
  url: string;
  fakeid?: string;
  title?: string;
  content: string;
  fetched_at?: number;
}

/**
 * 写入/更新一篇文章的纯文本正文（以 url 为唯一键）
 */
export async function upsertContent(c: ArticleContent): Promise<boolean> {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO article_content (url, fakeid, title, content, fetched_at)
      VALUES (?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT(url) DO UPDATE SET
        fakeid=excluded.fakeid,
        title=excluded.title,
        content=excluded.content,
        fetched_at=strftime('%s','now')
    `).run(c.url, c.fakeid || null, c.title || null, c.content);
    return true;
  } catch (error) {
    log.error('upsertContent failed:', error);
    return false;
  }
}

/** 每篇纯文本正文最大保留长度（防超长文章撑爆 AI token） */
const MAX_CONTENT_CHARS = 8000;

/**
 * 从原始 HTML 提取纯文本正文（微信文章容器：#js_content / .rich_media_content，兜底 body）
 */
export function extractTextFromHtml(html: string): string {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const raw =
      $('#js_content').text() ||
      $('.rich_media_content').text() ||
      $('body').text() ||
      '';
    const text = raw.replace(/\s+/g, ' ').trim();
    return text.length > MAX_CONTENT_CHARS ? `${text.slice(0, MAX_CONTENT_CHARS)}…` : text;
  } catch (error) {
    log.error('extractTextFromHtml failed:', error);
    return '';
  }
}

/**
 * 从原始 HTML 提取纯文本并存库（供 html/save 时调用）。
 * 提取失败或正文为空则不写（保留可能已有的旧数据）。
 */
export async function extractAndSaveContent(params: {
  url: string;
  fakeid?: string;
  title?: string;
  html: string;
}): Promise<boolean> {
  const text = extractTextFromHtml(params.html);
  if (text.length <= 50) return false; // 太短，可能是错误页
  return upsertContent({
    url: params.url,
    fakeid: params.fakeid,
    title: params.title,
    content: text,
  });
}

/**
 * 按 url 查单篇正文
 */
export async function getContentByUrl(url: string): Promise<ArticleContent | null> {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM article_content WHERE url = ?').get(url) as ArticleContent | undefined;
    return row || null;
  } catch (error) {
    log.error('getContentByUrl failed:', error);
    return null;
  }
}

/**
 * 批量按 url 查正文（返回 Map<url, content>，便于 AI 批量取用）
 */
export async function getContentsByUrls(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (urls.length === 0) return result;
  try {
    const db = getDatabase();
    const placeholders = urls.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT url, content FROM article_content WHERE url IN (${placeholders})`)
      .all(...urls) as { url: string; content: string }[];
    for (const r of rows) result.set(r.url, r.content);
  } catch (error) {
    log.error('getContentsByUrls failed:', error);
  }
  return result;
}

/**
 * 查最近 N 天、尚无正文的文章（供批量补抓用）。
 * 返回 { url, fakeid, title }[]
 */
export async function getArticlesMissingContent(
  days: number,
  limit: number
): Promise<{ url: string; fakeid: string; title: string }[]> {
  try {
    const db = getDatabase();
    const safeLimit = Math.max(1, Math.min(500, limit));
    let sql = `
      SELECT a.link AS url, a.fakeid, a.title
      FROM articles a
      LEFT JOIN article_content c ON a.link = c.url
      WHERE a.is_deleted = 0 AND a.link != '' AND c.url IS NULL
    `;
    const params: any[] = [];
    if (days && days > 0) {
      const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
      sql += ' AND a.create_time >= ?';
      params.push(cutoff);
    }
    sql += ' ORDER BY a.create_time DESC LIMIT ?';
    params.push(safeLimit);
    return db.prepare(sql).all(...params) as { url: string; fakeid: string; title: string }[];
  } catch (error) {
    log.error('getArticlesMissingContent failed:', error);
    return [];
  }
}

/**
 * 统计：最近 N 天文章中，已有正文的比例（供前端展示覆盖率）
 */
export async function getContentCoverage(days: number): Promise<{ total: number; withContent: number }> {
  try {
    const db = getDatabase();
    let sql = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN c.url IS NOT NULL THEN 1 ELSE 0 END) AS withContent
      FROM articles a
      LEFT JOIN article_content c ON a.link = c.url
      WHERE a.is_deleted = 0 AND a.link != ''
    `;
    const params: any[] = [];
    if (days && days > 0) {
      const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
      sql += ' AND a.create_time >= ?';
      params.push(cutoff);
    }
    const row = db.prepare(sql).get(...params) as { total: number; withContent: number | null };
    return { total: row.total || 0, withContent: row.withContent || 0 };
  } catch (error) {
    log.error('getContentCoverage failed:', error);
    return { total: 0, withContent: 0 };
  }
}
