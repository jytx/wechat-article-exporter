/**
 * 获取文章 HTML 内容
 * GET /api/web/data/v1/html/get?url=xxx
 */

import { getQuery } from 'h3';
import { getArticleHtml } from '~/server/database/html';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const url = query.url as string;

    if (!url) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, 'url 参数不能为空');
    }

    const html = await getArticleHtml(url);

    if (!html) {
      return successResponse({
        exists: false,
        data: null,
      });
    }

    return successResponse({
      exists: true,
      data: html,
    });
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('获取文章内容失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取文章内容失败',
    });
  }
});
