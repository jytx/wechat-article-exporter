/**
 * 应用门禁登出 API
 * POST /api/app-auth/logout
 *
 * 仅吊销当前会话 token（其它设备的会话不受影响），并清除 cookie。
 */

import { APP_TOKEN_COOKIE, clearAppTokenCookie } from '~/server/utils/app-auth';
import { removeSession } from '~/server/database/app-auth';

export default defineEventHandler(async event => {
  const token = getCookie(event, APP_TOKEN_COOKIE);
  if (token) {
    removeSession(token);
  }
  clearAppTokenCookie(event);

  return { success: true, message: '已登出' };
});
