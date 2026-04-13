/**
 * 批量更新文章
 * POST /api/web/data/v1/articles/batch-update
 */

import { markArticleAsDownloaded, updateArticleDeletedStatus } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes, validateParams } from '~/server/utils/api-response';

interface BatchUpdateBody {
  keys: string[];
  action: 'mark_downloaded' | 'mark_deleted' | 'mark_undeleted';
  data?: {
    downloadedAt?: string;
  };
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<BatchUpdateBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['keys', 'action']);

    if (!validation.valid) {
      throw createApiError(
        ErrorCodes.MISSING_PARAMETER,
        `缺少必需参数: ${validation.missing?.join(', ')}`
      );
    }

    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'keys 必须是非空数组');
    }

    let successCount = 0;
    let failCount = 0;

    // 执行批量操作
    for (const key of body.keys) {
      try {
        if (body.action === 'mark_downloaded') {
          const downloadedAt = body.data?.downloadedAt || new Date().toISOString();
          const success = await markArticleAsDownloaded(key, downloadedAt);
          if (success) successCount++;
          else failCount++;
        } else if (body.action === 'mark_deleted') {
          const success = await updateArticleDeletedStatus(key, true);
          if (success) successCount++;
          else failCount++;
        } else if (body.action === 'mark_undeleted') {
          const success = await updateArticleDeletedStatus(key, false);
          if (success) successCount++;
          else failCount++;
        }
      } catch (error) {
        console.error(`批量更新失败 [${key}]:`, error);
        failCount++;
      }
    }

    return successResponse({
      total: body.keys.length,
      success: successCount,
      failed: failCount
    }, `批量更新完成: 成功 ${successCount}, 失败 ${failCount}`);
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('批量更新失败:', error);
    throw createError({
      statusCode: 500,
      message: '批量更新失败'
    });
  }
});
