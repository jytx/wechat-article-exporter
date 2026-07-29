/**
 * 应用门禁状态查询
 * GET /api/app-auth/status
 *
 * 供前端判断当前是否已登录（app_token cookie 是否有效）。
 * 该接口在 auth 中间件的 publicPaths 中放行。
 */

import { APP_TOKEN_COOKIE } from '~/server/utils/app-auth';
import { findSession } from '~/server/database/app-auth';

export default defineEventHandler(async event => {
  const token = getCookie(event, APP_TOKEN_COOKIE);
  const session = token ? findSession(token) : null;

  return {
    success: true,
    data: {
      authenticated: session !== null,
    },
  };
});
