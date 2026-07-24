/**
 * 获取所有已保存的公众号列表
 * GET /api/skill/accounts
 */
import { getAllAccounts } from '~/server/database/account';
import { log } from '~/server/utils/log';

export default defineEventHandler(async (event) => {
  try {
    const accounts = await getAllAccounts();

    return {
      success: true,
      data: accounts,
    };
  } catch (error) {
    log.error('Failed to get accounts:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to get accounts',
    });
  }
});
