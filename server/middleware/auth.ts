/**
 * 应用门禁中间件（单密码门禁）
 *
 * 校验 app_token cookie 是否对应一个有效会话：
 *  - 无效/缺失：API 请求返回 401；页面请求重定向到 /signin。
 *  - 有效：放行。
 *
 * publicPaths 设计说明：
 *  采用「路径段精确前缀」匹配（以 / 为边界），避免 startsWith 导致的误放行
 *  （例如 /api/app-auth 不应放行 /api/app-auth-evil）。
 *
 *  收紧策略（相对旧 auth.ts）：
 *   - /api/web/data（核心业务数据 API）由「放行」改为「必须门禁」，
 *     这是门禁的核心意义：未通过门禁者无法访问业务数据。
 *   - /api/web/login、/api/web/mp 维持放行：这两组接口有独立的微信鉴权体系
 *     （auth-key + 微信 cookie），且存在服务端内部互调（如 bizlogin 调
 *     /api/web/mp/info），服务端内部请求带不上应用门禁 cookie，纳入门禁会死锁。
 *   - /api/skill 维持放行：该组接口供外部 HTTP 调用方使用且历史上一直公开，
 *     收紧会破坏既有外部集成，不在本次门禁范围。
 */

import { parseCookies } from 'h3';
import { findSession } from '~/server/database/app-auth';

/** app_token cookie 名称 */
const APP_TOKEN_COOKIE = 'app_token';

/** 放行路径（精确到路径段，每项为「某一路径及其子路径」） */
const publicPaths = [
  // —— 应用门禁自身接口 ——
  '/api/app-auth/login', // 门禁登录
  '/api/app-auth/status', // 门禁状态查询
  // —— 微信公众号相关：扫码登录与代理接口 ——
  // 这两组接口有独立的鉴权体系（auth-key + 微信 cookie），
  // 且存在服务端内部互调（如 bizlogin → /api/web/mp/info），
  // 服务端内部请求带不上应用门禁 cookie，故不纳入应用门禁，避免死锁。
  '/api/web/login', // 微信扫码登录流程
  '/api/web/mp', // 公众号代理接口（info/searchbiz 等，含服务端内部互调）
  // —— 既有公开 API ——
  '/api/public', // 既有公开 API
  '/api/skill', // 外部 HTTP 调用方使用的接口（维持现状）
  // —— 页面 ——
  '/signin', // 门禁页
  '/login', // 微信扫码登录页（保留，兼容旧入口）
  '/_nuxt', // Nuxt 静态资源
  '/favicon.ico',
  '/robots.txt',
];

/**
 * 判断是否为放行路径
 * 规则：path 等于 p，或 path 以 p + '/' 开头（保证 /api/app-auth 不误放 /api/app-auth-x）
 */
function isPublicPath(path: string): boolean {
  return publicPaths.some(p => path === p || path.startsWith(p + '/'));
}

export default defineEventHandler(async event => {
  const path = event.path || '';

  // 放行公开路径
  if (isPublicPath(path)) {
    return;
  }

  // 读取并校验 app_token
  const cookies = parseCookies(event);
  const token = cookies[APP_TOKEN_COOKIE];
  const session = token ? findSession(token) : null;

  if (!session) {
    if (path.startsWith('/api/')) {
      throw createError({
        statusCode: 401,
        statusMessage: '未认证',
        message: '请先登录',
      });
    }
    // 页面请求重定向到门禁页
    return sendRedirect(event, '/signin');
  }

  // 校验通过：将会话标记注入上下文，供后续 handler 使用
  event.context.appAuth = { token: session.token };
});
