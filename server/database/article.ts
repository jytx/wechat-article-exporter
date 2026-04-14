/**
 * 文章数据访问层 (SQLite)
 */

import { getDatabase } from '~/server/utils/database';

export interface Article {
  id?: number;
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover?: string;
  author?: string;
  create_time?: number;
  update_time?: number;
  datetime?: string;
  digest?: string;
  downloaded: number;
  is_deleted: number;
  album_id?: string;
  appmsg_album_infos?: any;
  created_at?: number;
  updated_at?: number;
  // 公众号信息（联表查询）
  account_nickname?: string;
  account_alias?: string;
}

/**
 * 保存单篇文章
 */
export async function saveArticle(article: Article): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO articles
      (key, fakeid, aid, title, link, cover, author, create_time, update_time, datetime, digest, downloaded, is_deleted, album_id, appmsg_album_infos, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      article.key,
      article.fakeid,
      article.aid,
      article.title,
      article.link,
      article.cover || null,
      article.author || null,
      article.create_time || null,
      article.update_time || null,
      article.datetime || null,
      article.digest || null,
      article.downloaded,
      article.is_deleted,
      article.album_id || null,
      JSON.stringify(article.appmsg_album_infos || [])
    );

    return true;
  } catch (error) {
    console.error('saveArticle failed:', error);
    return false;
  }
}

/**
 * 批量保存文章
 */
export async function saveArticles(articles: Article[]): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO articles
      (key, fakeid, aid, title, link, cover, author, create_time, update_time, datetime, digest, downloaded, is_deleted, album_id, appmsg_album_infos, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    const insertMany = db.transaction((articleList: Article[]) => {
      for (const article of articleList) {
        stmt.run(
          article.key,
          article.fakeid,
          article.aid,
          article.title,
          article.link,
          article.cover || null,
          article.author || null,
          article.create_time || null,
          article.update_time || null,
          article.datetime || null,
          article.digest || null,
          article.downloaded,
          article.is_deleted,
          article.album_id || null,
          JSON.stringify(article.appmsg_album_infos || [])
        );
      }
    });

    insertMany(articles);
    return articles.length;
  } catch (error) {
    console.error('saveArticles failed:', error);
    return 0;
  }
}

/**
 * 获取单篇文章
 */
export async function getArticle(key: string): Promise<Article | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM articles WHERE key = ? AND is_deleted = 0');
    const row = stmt.get(key) as any;
    return row || null;
  } catch (error) {
    console.error('getArticle failed:', error);
    return null;
  }
}

/**
 * 根据链接获取单篇文章
 */
export async function getArticleByUrl(url: string): Promise<Article | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM articles WHERE link = ? AND is_deleted = 0');
    const row = stmt.get(url) as any;
    return row || null;
  } catch (error) {
    console.error('getArticleByUrl failed:', error);
    return null;
  }
}

/**
 * 获取公众号的所有文章
 */
export async function getArticlesByFakeid(
  fakeid: string,
  options: {
    downloaded?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}
): Promise<{
  items: Article[];
  total: number;
}> {
  try {
    const db = getDatabase();
    const { downloaded, limit = 1000, offset = 0, search } = options;

    let whereClause = 'WHERE fakeid = ? AND is_deleted = 0';
    let whereClauseWithAlias = 'WHERE a.fakeid = ? AND a.is_deleted = 0';
    const params: any[] = [fakeid];

    if (downloaded !== undefined) {
      whereClause += ' AND downloaded = ?';
      whereClauseWithAlias += ' AND a.downloaded = ?';
      params.push(downloaded ? 1 : 0);
    }

    // 添加搜索条件（搜索标题或摘要）
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereClause += ' AND (title LIKE ? OR digest LIKE ?)';
      whereClauseWithAlias += ' AND (a.title LIKE ? OR a.digest LIKE ?)';
      params.push(searchPattern, searchPattern);
    }

    // 获取总数（不需要表别名，因为只查询单表）
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM articles ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // 获取分页数据，联表查询公众号信息（需要表别名）
    const dataStmt = db.prepare(`
      SELECT
        a.*,
        acc.nickname as account_nickname,
        acc.alias as account_alias
      FROM articles a
      LEFT JOIN accounts acc ON a.fakeid = acc.fakeid
      ${whereClauseWithAlias}
      ORDER BY a.create_time DESC
      LIMIT ? OFFSET ?
    `);
    const items = dataStmt.all(...params, limit, offset) as Article[];

    return { items, total };
  } catch (error) {
    console.error('getArticlesByFakeid failed:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 批量获取文章
 */
export async function getArticlesByFakeids(fakeids: string[]): Promise<Article[]> {
  try {
    if (fakeids.length === 0) return [];

    const db = getDatabase();
    const placeholders = fakeids.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM articles
      WHERE fakeid IN (${placeholders}) AND is_deleted = 0
      ORDER BY create_time DESC
    `);
    return stmt.all(...fakeids) as Article[];
  } catch (error) {
    console.error('getArticlesByFakeids failed:', error);
    return [];
  }
}

/**
 * 更新文章下载状态
 */
export async function updateArticleDownloaded(key: string, downloaded: boolean): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE articles
      SET downloaded = ?, updated_at = strftime('%s', 'now')
      WHERE key = ?
    `);
    stmt.run(downloaded ? 1 : 0, key);
    return true;
  } catch (error) {
    console.error('updateArticleDownloaded failed:', error);
    return false;
  }
}

/**
 * 批量更新文章下载状态
 */
export async function updateArticlesDownloaded(keys: string[], downloaded: boolean): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE articles
      SET downloaded = ?, updated_at = strftime('%s', 'now')
      WHERE key = ?
    `);

    let count = 0;
    const updateMany = db.transaction((keyList: string[]) => {
      for (const key of keyList) {
        stmt.run(downloaded ? 1 : 0, key);
        count++;
      }
    });

    updateMany(keys);
    return count;
  } catch (error) {
    console.error('updateArticlesDownloaded failed:', error);
    return 0;
  }
}

/**
 * 软删除文章
 */
export async function softDeleteArticle(key: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE articles SET is_deleted = 1 WHERE key = ?');
    stmt.run(key);
    return true;
  } catch (error) {
    console.error('softDeleteArticle failed:', error);
    return false;
  }
}

/**
 * 批量软删除公众号的所有文章
 */
export async function softDeleteArticlesByFakeid(fakeid: string): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE articles SET is_deleted = 1 WHERE fakeid = ?');
    const result = stmt.run(fakeid);
    return result.changes;
  } catch (error) {
    console.error('softDeleteArticlesByFakeid failed:', error);
    return 0;
  }
}

/**
 * 永久删除文章
 */
export async function deleteArticle(key: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM articles WHERE key = ?');
    stmt.run(key);
    return true;
  } catch (error) {
    console.error('deleteArticle failed:', error);
    return false;
  }
}

/**
 * 批量永久删除公众号的所有文章
 */
export async function deleteArticlesByFakeid(fakeid: string): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM articles WHERE fakeid = ?');
    const result = stmt.run(fakeid);
    return result.changes;
  } catch (error) {
    console.error('deleteArticlesByFakeid failed:', error);
    return 0;
  }
}

/**
 * 获取文章统计信息
 */
export async function getArticleStats(fakeid: string): Promise<{
  total: number;
  downloaded: number;
  pending: number;
}> {
  try {
    const db = getDatabase();

    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM articles
      WHERE fakeid = ? AND is_deleted = 0
    `);
    const totalResult = totalStmt.get(fakeid) as { count: number };

    const downloadedStmt = db.prepare(`
      SELECT COUNT(*) as count FROM articles
      WHERE fakeid = ? AND is_deleted = 0 AND downloaded = 1
    `);
    const downloadedResult = downloadedStmt.get(fakeid) as { count: number };

    return {
      total: totalResult.count,
      downloaded: downloadedResult.count,
      pending: totalResult.count - downloadedResult.count,
    };
  } catch (error) {
    console.error('getArticleStats failed:', error);
    return { total: 0, downloaded: 0, pending: 0 };
  }
}

/**
 * 标记文章为已下载 (兼容旧接口)
 */
export async function markArticleAsDownloaded(key: string, downloadedAt?: string): Promise<boolean> {
  try {
    return await updateArticleDownloaded(key, true);
  } catch (error) {
    console.error('markArticleAsDownloaded failed:', error);
    return false;
  }
}

/**
 * 获取未下载的文章
 */
export async function getUndownloadedArticles(fakeid: string): Promise<Article[]> {
  try {
    const result = await getArticlesByFakeid(fakeid, { downloaded: false });
    return result.items;
  } catch (error) {
    console.error('getUndownloadedArticles failed:', error);
    return [];
  }
}

/**
 * 获取公众号的所有文章 (兼容旧接口)
 */
export async function getAllArticlesByFakeid(fakeid: string): Promise<Article[]> {
  try {
    const result = await getArticlesByFakeid(fakeid);
    // 按创建时间倒序排序
    return result.items.sort((a, b) => (b.create_time || 0) - (a.create_time || 0));
  } catch (error) {
    console.error('getAllArticlesByFakeid failed:', error);
    return [];
  }
}

/**
 * 更新文章删除状态 (兼容旧接口)
 */
export async function updateArticleDeletedStatus(key: string, isDeleted: boolean): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE articles
      SET is_deleted = ?, updated_at = strftime('%s', 'now')
      WHERE key = ?
    `);
    stmt.run(isDeleted ? 1 : 0, key);
    return true;
  } catch (error) {
    console.error('updateArticleDeletedStatus failed:', error);
    return false;
  }
}
