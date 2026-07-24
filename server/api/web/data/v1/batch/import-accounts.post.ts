/**
 * 批量导入公众号
 * POST /api/web/data/v1/batch/import-accounts
 */

import { saveAccount, getAccount } from '~/server/database/account';
import { successResponse, validateParams, ErrorCodes, createApiError } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface ImportAccountsBody {
  accounts: Array<{
    fakeid: string;
    nickname?: string;
    alias?: string;
    round_head_img?: string;
    signature?: string;
  }>;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ImportAccountsBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['accounts']);

    if (!validation.valid) {
      throw createApiError(
        ErrorCodes.MISSING_PARAMETER,
        `缺少必需参数: ${validation.missing?.join(', ')}`
      );
    }

    if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'accounts 必须是非空数组');
    }

    // 限制一次最多导入 100 个公众号
    if (body.accounts.length > 100) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, '一次最多导入 100 个公众号');
    }

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ index: number; fakeid: string; error: string }> = [];

    // 批量导入
    for (let i = 0; i < body.accounts.length; i++) {
      const item = body.accounts[i];

      try {
        // 验证 fakeid
        if (!item.fakeid) {
          errors.push({
            index: i,
            fakeid: 'unknown',
            error: 'fakeid 不能为空'
          });
          failedCount++;
          continue;
        }

        // 检查是否已存在
        const existing = await getAccount(item.fakeid);

        if (existing) {
          // 跳过已存在的公众号
          successCount++;
          continue;
        }

        // 创建公众号
        const account = {
          fakeid: item.fakeid,
          nickname: item.nickname || '',
          alias: item.alias,
          round_head_img: item.round_head_img,
          signature: item.signature,
          total_count: 0,
          synced_count: 0
        };

        await saveAccount(account);
        successCount++;

      } catch (error) {
        log.error(`导入公众号失败 [${i}]:`, error);
        errors.push({
          index: i,
          fakeid: item.fakeid || 'unknown',
          error: error instanceof Error ? error.message : '未知错误'
        });
        failedCount++;
      }
    }

    return successResponse({
      total: body.accounts.length,
      success: successCount,
      failed: failedCount,
      ...(errors.length > 0 && { errors: errors.slice(0, 10) }) // 最多返回 10 个错误
    }, `批量导入完成: 成功 ${successCount}, 失败 ${failedCount}`);

  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('批量导入公众号失败:', error);
    throw createError({
      statusCode: 500,
      message: '批量导入公众号失败'
    });
  }
});
