/**
 * 文章内容（HTML）数据访问层 (SQLite)
 */

import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

export interface ArticleHtml {
  id?: number;
  url: string;
  fakeid: string;
  title: string;
  content: string; // HTML 内容
  comment_id?: string;
  downloaded_at?: number;
  created_at?: number;
  updated_at?: number;
}

/**
 * 保存文章 HTML 内容
 */
export async function saveArticleHtml(html: ArticleHtml): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO article_html
      (url, fakeid, title, content, comment_id, downloaded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      html.url,
      html.fakeid,
      html.title,
      html.content,
      html.comment_id || null,
      html.downloaded_at || Math.floor(Date.now() / 1000)
    );

    return true;
  } catch (error) {
    log.error('saveArticleHtml failed:', error);
    return false;
  }
}

/**
 * 获取文章 HTML 内容
 */
export async function getArticleHtml(url: string): Promise<ArticleHtml | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM article_html WHERE url = ?');
    const row = stmt.get(url) as any;
    return row || null;
  } catch (error) {
    log.error('getArticleHtml failed:', error);
    return null;
  }
}

/**
 * 批量获取文章 HTML 内容
 */
export async function getArticleHtmlBatch(urls: string[]): Promise<Map<string, ArticleHtml>> {
  try {
    const db = getDatabase();
    const placeholders = urls.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM article_html WHERE url IN (${placeholders})`);
    const rows = stmt.all(...urls) as ArticleHtml[];

    const map = new Map<string, ArticleHtml>();
    for (const row of rows) {
      map.set(row.url, row);
    }
    return map;
  } catch (error) {
    log.error('getArticleHtmlBatch failed:', error);
    return new Map();
  }
}

/**
 * 检查文章 HTML 是否已下载
 */
export async function isArticleHtmlDownloaded(url: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM article_html WHERE url = ?');
    const row = stmt.get(url) as { count: number };
    return row.count > 0;
  } catch (error) {
    log.error('isArticleHtmlDownloaded failed:', error);
    return false;
  }
}

/**
 * 删除文章 HTML 内容
 */
export async function deleteArticleHtml(url: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM article_html WHERE url = ?');
    stmt.run(url);
    return true;
  } catch (error) {
    log.error('deleteArticleHtml failed:', error);
    return false;
  }
}

/**
 * 清空指定公众号的所有 HTML 内容
 */
export async function clearArticleHtmlByFakeid(fakeid: string): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM article_html WHERE fakeid = ?');
    const result = stmt.run(fakeid);
    return result.changes;
  } catch (error) {
    log.error('clearArticleHtmlByFakeid failed:', error);
    return 0;
  }
}
