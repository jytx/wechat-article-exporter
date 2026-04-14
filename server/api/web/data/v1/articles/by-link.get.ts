/**
 * 根据链接获取文章详情
 * GET /api/web/data/v1/articles/by-link?url=xxx
 */

import { getQuery } from 'h3';
import { getArticleByUrl } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const url = query.url as string;

    if (!url) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, 'url 参数不能为空');
    }

    const article = await getArticleByUrl(url);

    if (!article) {
      throw createApiError(ErrorCodes.ARTICLE_NOT_FOUND, `文章不存在: ${url}`);
    }

    return successResponse(article);
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('根据链接获取文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '根据链接获取文章失败',
    });
  }
});
