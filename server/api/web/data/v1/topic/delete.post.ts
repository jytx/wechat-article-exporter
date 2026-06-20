/**
 * 批量删除选题
 * POST /api/web/data/v1/topic/delete
 *
 * Body: { ids: number[] }  —— 要删除的选题 id 列表
 */
import { deleteTopics } from '~/server/database/topic';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const body = await readBody<{ ids?: number[] }>(event);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    throw createApiError(ErrorCodes.MISSING_PARAMETER, '缺少待删除的选题 id');
  }

  // 防御性：过滤掉非数字，限制单次最大数量
  const ids = body.ids
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, 1000);

  if (ids.length === 0) {
    throw createApiError(ErrorCodes.INVALID_PARAMETER, 'ids 参数无效');
  }

  const deleted = await deleteTopics(ids);
  return successResponse({ deleted }, `已删除 ${deleted} 条选题`);
});
