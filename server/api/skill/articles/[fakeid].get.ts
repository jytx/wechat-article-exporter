/**
 * 获取公众号的文章列表
 * GET /api/skill/articles/:fakeid?begin=0&size=20
 */
import { getArticlesByFakeid } from '~/server/database/article';
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

    const query = getQuery(event);
    const begin = Number(query.begin || 0);
    const size = Number(query.size || 20);

    // 获取公众号信息，确认公众号存在
    const account = await getAccount(fakeid);
    if (!account) {
      throw createError({
        statusCode: 404,
        message: '公众号不存在',
      });
    }

    // 获取文章列表
    const result = await getArticlesByFakeid(fakeid, { offset: begin, limit: size });

    return {
      success: true,
      data: {
        fakeid,
        nickname: account.nickname,
        total: result.total,
        articles: result.items,
      },
    };
  } catch (error) {
    console.error('Failed to get articles:', error);
    throw error;
  }
});
