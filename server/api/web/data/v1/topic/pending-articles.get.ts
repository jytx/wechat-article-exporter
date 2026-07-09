/**
 * 查询最近 N 天「尚未下载正文」的文章列表（给前端浏览器去抓取）
 * GET /api/web/data/v1/topic/pending-articles
 *
 * 参数：
 *   days  - 最近 N 天（默认 7，取自 ai_config.articleDays）
 *   limit - 最多返回多少篇（默认 50）
 *
 * 前端拿到这个 url 列表后，用 useDownloader 走浏览器抓取。
 */
import { getAllSettings } from '~/server/database/settings';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);

  // 默认取 ai_config.articleDays
  const settings = getAllSettings();
  let defaultDays = 7;
  try {
    defaultDays = JSON.parse(settings.ai_config || '{}').articleDays ?? 7;
  } catch {
    // 默认值
  }

  const days = Math.max(0, Math.min(90, Number(query.days ?? defaultDays)));
  const limit = Math.max(1, Math.min(200, Number(query.limit ?? 50)));

  // 直接查库：最近 N 天、没在 article_html（即未下载正文）的文章
  const { getDatabase } = await import('~/server/utils/database');
  const db = getDatabase();

  let sql = `
    SELECT a.link AS url, a.fakeid, a.title, a.digest, acc.nickname AS account_nickname
    FROM articles a
    LEFT JOIN accounts acc ON a.fakeid = acc.fakeid
    LEFT JOIN article_html h ON a.link = h.url
    WHERE a.is_deleted = 0 AND a.link != '' AND h.url IS NULL
  `;
  const params: any[] = [];
  if (days > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    sql += ' AND a.create_time >= ?';
    params.push(cutoff);
  }
  sql += ' ORDER BY a.create_time DESC LIMIT ?';
  params.push(limit);

  const items = db.prepare(sql).all(...params) as {
    url: string;
    fakeid: string;
    title: string;
    digest?: string;
    account_nickname?: string;
  }[];

  return successResponse({ items, count: items.length, days, limit });
});
