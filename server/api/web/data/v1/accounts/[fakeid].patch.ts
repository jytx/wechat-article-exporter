/**
 * 更新公众号信息
 * PATCH /api/web/data/v1/accounts/:fakeid
 */

import { getAccount, saveAccount } from '~/server/database/account';
import { createApiError, ErrorCodes, successResponse } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface UpdateAccountBody {
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  total_count?: number;
  synced_count?: number;
}

export default defineEventHandler(async event => {
  try {
    const fakeid = getRouterParam(event, 'fakeid');

    if (!fakeid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER);
    }

    const body = await readBody<UpdateAccountBody>(event);

    // 获取现有公众号
    const account = await getAccount(fakeid);

    if (!account) {
      throw createApiError(ErrorCodes.ACCOUNT_NOT_FOUND);
    }

    // 更新字段
    const now = Math.floor(Date.now() / 1000);
    const updated = {
      ...account,
      ...(body.nickname !== undefined && { nickname: body.nickname }),
      ...(body.alias !== undefined && { alias: body.alias }),
      ...(body.round_head_img !== undefined && { round_head_img: body.round_head_img }),
      ...(body.signature !== undefined && { signature: body.signature }),
      ...(body.total_count !== undefined && { total_count: body.total_count }),
      ...(body.synced_count !== undefined && { synced_count: body.synced_count }),
      // 如果更新了统计数据，同时更新 update_time
      ...((body.total_count !== undefined || body.synced_count !== undefined) && { update_time: now }),
    };

    await saveAccount(updated);

    return successResponse(updated, '公众号更新成功');
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('更新公众号失败:', error);
    throw createError({
      statusCode: 500,
      message: '更新公众号失败',
    });
  }
});
