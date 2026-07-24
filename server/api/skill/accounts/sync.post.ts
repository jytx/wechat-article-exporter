/**
 * 同步公众号信息并保存到服务器存储
 * POST /api/skill/accounts/sync
 *
 * Body: { fakeid: string }
 */
import { saveAccount } from '~/server/database/account';
import { getCookieFromStore } from '~/server/utils/CookieStore';
import { log } from '~/server/utils/log';

interface SyncAccountBody {
  fakeid: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SyncAccountBody>(event);

    if (!body.fakeid) {
      throw createError({
        statusCode: 400,
        message: 'fakeid 参数不能为空',
      });
    }

    // 从 CookieStore 中获取 cookie
    const cookie = await getCookieFromStore(event);
    if (!cookie) {
      throw createError({
        statusCode: 400,
        message: '请先登录',
      });
    }

    // 调用微信 API 获取公众号信息
    const baseUrl = 'https://mp.weixin.qq.com';
    const infoUrl = `${baseUrl}/cgi-bin/home`;

    const response = await fetch(infoUrl, {
      method: 'GET',
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw createError({
        statusCode: 500,
        message: '获取公众号信息失败',
      });
    }

    // 这里简化处理，实际需要解析返回的 HTML 或 JSON
    // 暂时使用 fakeid 作为基本数据
    const accountData = {
      fakeid: body.fakeid,
      nickname: '', // 需要从其他接口获取
      total_count: 0,
      synced_count: 0,
    };

    await saveAccount(accountData);

    return {
      success: true,
      data: accountData,
    };
  } catch (error) {
    log.error('Failed to sync account:', error);
    throw error;
  }
});
