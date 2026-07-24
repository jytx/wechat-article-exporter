/**
 * 文章推送去重数据访问层
 *
 * 通过 article_push_log 表精确记录每篇文章是否已被订阅推送过，
 * 确保同一篇文章无论用 create_time 还是 created_at 查询都只推送一次。
 */

import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

/**
 * 批量标记文章为已推送（INSERT OR IGNORE，已记录过的跳过）。
 * 在订阅推送成功后调用，记录本次推送的文章。
 *
 * @param articleKeys 本次推送的文章 key 列表
 * @returns 实际新增记录数（已存在的不计）
 */
export function markArticlesAsPushed(articleKeys: string[]): number {
  if (articleKeys.length === 0) return 0;
  try {
    const db = getDatabase();
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO article_push_log (article_key, pushed_at) VALUES (?, strftime('%s', 'now'))"
    );
    const insertMany = db.transaction((keys: string[]) => {
      for (const key of keys) {
        stmt.run(key);
      }
    });
    const before = (db.prepare('SELECT COUNT(*) AS c FROM article_push_log').get() as { c: number }).c;
    insertMany(articleKeys);
    const after = (db.prepare('SELECT COUNT(*) AS c FROM article_push_log').get() as { c: number }).c;
    return Math.max(0, after - before);
  } catch (error) {
    log.error('markArticlesAsPushed failed:', error);
    return 0;
  }
}
