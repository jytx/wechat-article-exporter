/**
 * 获取公众号详情
 * GET /api/skill/accounts/:fakeid
 */
import { getAccount } from '~/server/database/account';

export default defineEventHandler(async (event) => {
  try {
    const fakeid = getRouterParam(event, 'fakeid');
    if (!fakeid) {
      throw createError({
        statusCode: 400,
        message: 'fakeid 参数缺失',
      });
    }

    const account = await getAccount(fakeid);
    if (!account) {
      throw createError({
        statusCode: 404,
        message: '公众号不存在',
      });
    }

    return {
      success: true,
      data: account,
    };
  } catch (error) {
    console.error('Failed to get account:', error);
    throw error;
  }
});
