/**
 * 选题热榜查询
 * GET /api/web/data/v1/metrics/ranking
 *
 * 不依赖阅读量（阅读量需 Credential），直接基于 articles 表的已有数据排序：
 * - 按发布时间倒序（新鲜度，最新发布的排前面）
 * - 支持按公众号、时间范围筛选
 *
 * 参数：
 *   fakeids  - 逗号分隔的公众号ID列表（可选，不传=全部）
 *   days     - 时间范围，如 7=最近7天（可选，不传=最近30天）
 *   search   - 标题关键词搜索（可选）
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 50
 */

import { getDatabase } from '~/server/utils/database';
import { successResponse } from '~/server/utils/api-response';

interface RankingItem {
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover: string | null;
  author: string | null;
  create_time: number | null;
  digest: string | null;
  album_id: string | null;
  datetime: string | null;
  account_nickname: string | null;
  // 派生字段
  is_in_album: boolean; // 是否被收录进合集（质量信号）
}

export default defineEventHandler(async event => {
  const query = getQuery(event);

  const fakeidsRaw = query.fakeids as string | undefined;
  const fakeids = fakeidsRaw
    ? fakeidsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;

  const days = query.days ? Math.max(0, Number(query.days)) : 30;
  const search = (query.search as string) || '';

  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 50)));
  const offset = (page - 1) * pageSize;

  const db = getDatabase();

  // 构建 WHERE 条件
  const where: string[] = ['a.is_deleted = 0'];
  const params: any[] = [];

  if (fakeids && fakeids.length > 0) {
    const placeholders = fakeids.map(() => '?').join(',');
    where.push(`a.fakeid IN (${placeholders})`);
    params.push(...fakeids);
  }

  if (days > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    where.push('(a.create_time IS NULL OR a.create_time >= ?)');
    params.push(cutoff);
  }

  if (search.trim()) {
    where.push('(a.title LIKE ? OR a.digest LIKE ?)');
    const pattern = `%${search.trim()}%`;
    params.push(pattern, pattern);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  // 查询总数
  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM articles a ${whereClause}`)
    .get(...params) as { total: number };
  const total = countRow.total;

  // 查询分页数据（按发布时间倒序，联表带出公众号名称）
  const rows = db
    .prepare(
      `SELECT
        a.key, a.fakeid, a.aid, a.title, a.link, a.cover, a.author,
        a.create_time, a.digest, a.album_id, a.datetime,
        acc.nickname AS account_nickname
      FROM articles a
      LEFT JOIN accounts acc ON a.fakeid = acc.fakeid
      ${whereClause}
      ORDER BY a.create_time DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as any[];

  // 计算派生字段
  const items: RankingItem[] = rows.map(row => ({
    ...row,
    is_in_album: !!(row.album_id && row.album_id !== ''),
  }));

  return successResponse({
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
    },
  });
});
