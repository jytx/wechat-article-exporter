/**
 * 标记文章为已下载
 * PATCH /api/web/data/v1/articles/:key/downloaded
 */

import { markArticleAsDownloaded } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface MarkDownloadedBody {
  downloadedAt?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const key = getRouterParam(event, 'key');

    if (!key) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    const body = await readBody<MarkDownloadedBody>(event);

    // 标记为已下载
    const downloadedAt = body?.downloadedAt || new Date().toISOString();
    const success = await markArticleAsDownloaded(key, downloadedAt);

    if (!success) {
      throw createApiError(ErrorCodes.ARTICLE_NOT_FOUND);
    }

    return successResponse(null, '标记成功');
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
