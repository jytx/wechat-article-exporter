import dayjs from 'dayjs';
import { randomUUID } from 'uncrypto';
import { request } from '#shared/utils/request';
import { deleteCookie as deleteMpCookie } from '~/server/database/cookie';
import { createUser, getUserByUsername, updateUserToken } from '~/server/database/user';
import { cookieStore, getCookieFromResponse, getCookiesFromRequest } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const cookie = getCookiesFromRequest(event);

  const payload: Record<string, string | number> = {
    userlang: 'zh_CN',
    redirect_url: '',
    cookie_forbidden: 0,
    cookie_cleaned: 0,
    plugin_used: 0,
    login_type: 3,
    token: '',
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  const response: Response = await proxyMpRequest({
    event: event,
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: {
      action: 'login',
    },
    body: payload,
    cookie: cookie,
    action: 'login', // 微信登录成功后的特殊处理
  });

  // 从响应中获取临时的 auth-key
  const tempAuthKey = getCookieFromResponse('auth-key', response);
  if (!tempAuthKey) {
    return {
      err: '登录失败，未获取到认证信息',
    };
  }

  // 使用临时的 auth-key 获取公众号信息
  const { nick_name, head_img } = await request(`/api/web/mp/info`, {
    headers: {
      Cookie: `auth-key=${tempAuthKey}`,
    },
  });

  if (!nick_name) {
    return {
      err: '获取公众号昵称失败，请稍后重试',
    };
  }

  // 使用公众号昵称作为用户名
  const username = `wx_${nick_name}`;

  // 查找或创建用户
  let user = getUserByUsername(username);

  if (!user) {
    // 创建新用户，使用固定 token（基于公众号昵称的 hash）
    const fixedToken = randomUUID().replace(/-/g, '');
    const success = createUser(username, fixedToken, fixedToken);
    if (!success) {
      return {
        err: '创建用户失败',
      };
    }
    user = getUserByUsername(username)!;
  }

  // 使用用户的固定 token
  const userToken = user.token;

  // 将微信 cookie 从临时 auth-key 迁移到用户的固定 token
  // 关键：必须同时更新内存缓存（cookieStore）和 SQLite，否则「内存优先」会读到旧 cookie，
  // 导致重新扫码后同步仍提示 session 过期。
  const migrated = await cookieStore.migrateCookie(tempAuthKey, userToken);
  if (migrated) {
    // 清理 SQLite 中临时 auth-key 的记录（migrateCookie 已清内存）
    await deleteMpCookie(tempAuthKey);
  }

  // 设置 auth-key cookie（使用用户的固定 token）
  // 先清除旧的 auth-key cookie，然后设置新的
  setCookie(event, 'auth-key', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: -1, // 立即过期
    path: '/',
  });

  setCookie(event, 'auth-key', userToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 天
    path: '/',
  });

  return {
    nickname: nick_name,
    avatar: head_img,
    expires: dayjs().add(30, 'days').toString(),
  };
});
