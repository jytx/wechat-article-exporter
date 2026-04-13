/**
 * 认证中间件
 * 验证用户身份并注入用户信息到 event.context
 */

import { parseCookies } from 'h3';
import { getUserByToken } from '~/server/database/user';

// 不需要认证的路径
const publicPaths = [
  '/api/auth/login', // 登录 API
  '/api/auth/status', // 登录状态检查 API
  '/api/public', // 现有的公开 API
  '/api/skill', // Skill API（暂时公开）
  '/api/web/login', // 微信公众号登录API
  '/api/web/mp', // 微信公众号信息API（扫码登录流程）
  '/api/web/data', // 数据 API（公众号、文章等）
  '/login', // 登录页面
  '/_nuxt', // Nuxt 内部请求
];

export default defineEventHandler(async event => {
  // 获取请求路径（确保不为 null）
  const path = event.path || '';

  // 检查是否是公开路径
  const isPublicPath = publicPaths.some(p => path.startsWith(p));

  if (isPublicPath) {
    return;
  }

  // 从 cookie 中获取 auth-key
  const cookies = parseCookies(event);
  const authKey = cookies['auth-key'];

  if (!authKey) {
    // API 请求返回 401
    if (path.startsWith('/api/')) {
      throw createError({
        statusCode: 401,
        statusMessage: '未认证',
        message: '请先登录',
      });
    }

    // 页面请求重定向到登录页
    return sendRedirect(event, '/login');
  }

  // 验证 auth-key 并获取用户信息
  const user = getUserByToken(authKey);

  if (!user) {
    // auth-key 无效，需要重新登录
    if (path.startsWith('/api/')) {
      throw createError({
        statusCode: 401,
        statusMessage: '认证失效',
        message: '登录已过期，请重新登录',
      });
    }

    return sendRedirect(event, '/login');
  }

  // 将用户信息注入到 event.context
  event.context.user = {
    id: user.id,
    username: user.username,
    token: user.token,
  };
});
