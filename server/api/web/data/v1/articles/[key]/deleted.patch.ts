/**
 * 标记文章为已删除
 * PATCH /api/web/data/v1/articles/:key/deleted
 */

import { updateArticleDeletedStatus } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface MarkDeletedBody {
  is_deleted: boolean;
}

export default defineEventHandler(async (event) => {
  try {
    const key = getRouterParam(event, 'key');

    if (!key) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    const body = await readBody<MarkDeletedBody>(event);

    if (body.is_deleted === undefined) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '缺少 is_deleted 参数');
    }

    // 标记删除状态
    const success = await updateArticleDeletedStatus(key, body.is_deleted);

    if (!success) {
      throw createApiError(ErrorCodes.ARTICLE_NOT_FOUND);
    }

    return successResponse(null, body.is_deleted ? '文章已删除' : '文章已恢复');
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('标记文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '标记文章失败'
    });
  }
});
