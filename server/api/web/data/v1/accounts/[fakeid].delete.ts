/**
 * 删除公众号
 * DELETE /api/web/data/v1/accounts/:fakeid
 */

import { deleteAccount, getAccount } from '~/server/database/account';
import { deleteArticlesByFakeid } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

export default defineEventHandler(async (event) => {
  try {
    const fakeid = getRouterParam(event, 'fakeid');

    if (!fakeid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    // 检查公众号是否存在
    const account = await getAccount(fakeid);

    if (!account) {
      throw createApiError(ErrorCodes.ACCOUNT_NOT_FOUND);
    }

    // 删除公众号的所有文章
    await deleteArticlesByFakeid(fakeid);

    // 删除公众号
    const deleted = await deleteAccount(fakeid);

    if (!deleted) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '删除公众号失败');
    }

    return successResponse(null, '公众号删除成功');
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('删除公众号失败:', error);
    throw createError({
      statusCode: 500,
      message: '删除公众号失败'
    });
  }
});
