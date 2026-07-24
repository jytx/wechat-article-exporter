/**
 * 获取单篇文章详情
 * GET /api/web/data/v1/articles/:key
 */

import { getArticle } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

export default defineEventHandler(async (event) => {
  try {
    const key = getRouterParam(event, 'key');

    if (!key) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    const article = await getArticle(key);

    if (!article) {
      throw createApiError(ErrorCodes.ARTICLE_NOT_FOUND);
    }

    return successResponse(article);
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('获取文章详情失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取文章详情失败'
    });
  }
});
