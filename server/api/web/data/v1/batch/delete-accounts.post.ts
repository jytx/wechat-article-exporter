/**
 * 批量删除公众号
 * POST /api/web/data/v1/batch/delete-accounts
 */

import { deleteAccount, getAccount } from '~/server/database/account';
import { deleteArticlesByFakeid } from '~/server/database/article';
import { successResponse, validateParams, ErrorCodes, createApiError } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface DeleteAccountsBody {
  fakeids: string[];
  delete_articles?: boolean; // 是否同时删除文章
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<DeleteAccountsBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['fakeids']);

    if (!validation.valid) {
      throw createApiError(
        ErrorCodes.MISSING_PARAMETER,
        `缺少必需参数: ${validation.missing?.join(', ')}`
      );
    }

    if (!Array.isArray(body.fakeids) || body.fakeids.length === 0) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'fakeids 必须是非空数组');
    }

    // 限制一次最多删除 50 个公众号
    if (body.fakeids.length > 50) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, '一次最多删除 50 个公众号');
    }

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ fakeid: string; error: string }> = [];

    // 是否删除文章
    const deleteArticles = body.delete_articles !== false; // 默认 true

    // 批量删除
    for (const fakeid of body.fakeids) {
      try {
        // 检查公众号是否存在
        const account = await getAccount(fakeid);

        if (!account) {
          errors.push({
            fakeid,
            error: '公众号不存在'
          });
          failedCount++;
          continue;
        }

        // 删除文章
        if (deleteArticles) {
          await deleteArticlesByFakeid(fakeid);
        }

        // 删除公众号
        const deleted = await deleteAccount(fakeid);

        if (deleted) {
          successCount++;
        } else {
          errors.push({
            fakeid,
            error: '删除失败'
          });
          failedCount++;
        }

      } catch (error) {
        log.error(`删除公众号失败 [${fakeid}]:`, error);
        errors.push({
          fakeid,
          error: error instanceof Error ? error.message : '未知错误'
        });
        failedCount++;
      }
    }

    return successResponse({
      total: body.fakeids.length,
      success: successCount,
      failed: failedCount,
      ...(errors.length > 0 && { errors: errors.slice(0, 10) })
    }, `批量删除完成: 成功 ${successCount}, 失败 ${failedCount}`);

  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('批量删除公众号失败:', error);
    throw createError({
      statusCode: 500,
      message: '批量删除公众号失败'
    });
  }
});
