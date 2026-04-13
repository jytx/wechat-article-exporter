/**
 * 获取单个公众号详情
 * GET /api/web/data/v1/accounts/:fakeid
 */

import { getAccount } from '~/server/database/account';
import { getArticlesByFakeid } from '~/server/database/article';
import { createApiError, ErrorCodes, successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const fakeid = getRouterParam(event, 'fakeid');

    if (!fakeid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    // 获取公众号信息
    const account = await getAccount(fakeid);

    if (!account) {
      throw createApiError(ErrorCodes.ACCOUNT_NOT_FOUND);
    }

    // 获取统计信息
    const result = await getArticlesByFakeid(fakeid);
    const downloadedCount = result.items.filter(a => a.downloaded).length;
    const pendingCount = result.items.filter(a => !a.downloaded && !a.is_deleted).length;

    // 返回公众号信息，同时更新统计字段以供前端 AG Grid 显示
    return successResponse({
      ...account,
      // 用实际的统计数据覆盖（前端 AG Grid 直接读取这些字段）
      total_count: account.total_count || 0,
      synced_count: result.total,
      stats: {
        total_articles: result.total,
        downloaded_count: downloadedCount,
        pending_count: pendingCount,
      },
    });
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('获取公众号详情失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取公众号详情失败',
    });
  }
});
