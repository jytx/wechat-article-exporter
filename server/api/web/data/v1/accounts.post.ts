/**
 * 添加公众号
 * POST /api/web/data/v1/accounts
 */

import { getAccount, saveAccount } from '~/server/database/account';
import { createApiError, ErrorCodes, successResponse, validateParams } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface CreateAccountBody {
  fakeid: string;
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<CreateAccountBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['fakeid']);

    if (!validation.valid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, `缺少必需参数: ${validation.missing?.join(', ')}`);
    }

    // 检查公众号是否已存在
    const existing = await getAccount(body.fakeid);

    if (existing) {
      throw createApiError(ErrorCodes.ACCOUNT_ALREADY_EXISTS);
    }

    // 创建公众号
    const now = Math.floor(Date.now() / 1000); // Unix 时间戳（秒）
    const account = {
      fakeid: body.fakeid,
      nickname: body.nickname || '',
      alias: body.alias,
      round_head_img: body.round_head_img,
      signature: body.signature,
      total_count: 0,
      synced_count: 0,
      create_time: now,
      update_time: now,
    };

    const saved = await saveAccount(account);

    if (!saved) {
      throw createApiError(ErrorCodes.DATABASE_ERROR, '保存公众号失败');
    }

    return successResponse(account, '公众号添加成功');
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('添加公众号失败:', error);
    throw createError({
      statusCode: 500,
      message: '添加公众号失败',
    });
  }
});
