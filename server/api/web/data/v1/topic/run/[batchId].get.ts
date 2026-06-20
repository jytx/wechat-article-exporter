/**
 * 查询某次选题的分析过程详情
 * GET /api/web/data/v1/topic/run/:batchId
 *
 * 返回该批次的：分析过程记录（prompt/原始返回/耗时/token/重试）+ 选题列表。
 * 用于前端「查看分析过程」。
 */
import { getTopicRunByBatch, getTopicsByBatch } from '~/server/database/topic';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const batchId = getRouterParam(event, 'batchId') as string;
  if (!batchId) {
    return successResponse({ found: false }, '缺少 batchId');
  }

  const [run, topics] = await Promise.all([getTopicRunByBatch(batchId), getTopicsByBatch(batchId)]);

  if (!run && topics.length === 0) {
    return successResponse({ found: false }, '批次不存在');
  }

  return successResponse({
    found: true,
    run,
    topics,
  });
});
