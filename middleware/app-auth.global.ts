/**
 * 应用门禁前端路由守卫（全局）
 *
 * 与服务端中间件 server/middleware/auth.ts 配合：
 *  - 服务端中间件负责首次直接访问 URL 时的拦截与重定向（SPA 首屏由服务端返回）。
 *  - 本客户端中间件负责 SPA 内部路由跳转时的门禁校验。
 *
 * 规则：
 *  - 未通过门禁（且不在门禁页）→ 跳 /signin
 *  - 已通过门禁但停留在 /signin → 跳 /dashboard（避免重复登录）
 */

import { useAppAuth } from '~/composables/useAppAuth';

/** 门禁页路由 */
const SIGNIN_ROUTE = '/signin';

export default defineNuxtRouteMiddleware(async to => {
  // 排除门禁页本身，避免无限重定向
  const { state, checkStatus } = useAppAuth();

  // 首次进入或在路由间切换，若尚未确认登录态，则先查询一次
  if (state.value.loading) {
    await checkStatus();
  }

  const authenticated = state.value.authenticated;

  // 未登录且访问的不是门禁页 → 引导到门禁页
  if (!authenticated && to.path !== SIGNIN_ROUTE) {
    return navigateTo(SIGNIN_ROUTE);
  }

  // 已登录却访问门禁页 → 引导到首页
  if (authenticated && to.path === SIGNIN_ROUTE) {
    return navigateTo('/dashboard/account');
  }
});
