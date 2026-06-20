/**
 * 分页查询选题列表
 * GET /api/web/data/v1/topic/list
 *
 * 参数：
 *   page, pageSize - 分页（默认 1 / 20）
 *   batchId        - 指定批次时只返回该批次的选题
 */
import { getRecentTopics, getTopicsByBatch } from '~/server/database/topic';
import { paginatedResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const batchId = query.batchId as string | undefined;

  if (batchId) {
    const items = await getTopicsByBatch(batchId);
    return paginatedResponse(items, items.length, 1, items.length || 1);
  }

  const { items, total } = await getRecentTopics(page, pageSize);
  return paginatedResponse(items, total, page, pageSize);
});
