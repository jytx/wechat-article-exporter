/**
 * 应用登录态检查
 *
 * 对接「应用门禁」(useAppAuth) 状态。
 * 注意：本检查仅用于「应用是否已通过门禁」。
 * 微信公众号扫码登录态是独立的子功能（见 components/modal/Login.vue、SessionExpiredBanner），
 * 不在此处判断。
 *
 * 由于应用门禁已由全局路由守卫 + 服务端中间件统一保障，
 * 能进入 dashboard 的用户必然已通过门禁，故此处主要用于操作前的本地状态确认，
 * 失败时引导到门禁页 /signin。
 */

import { useAppAuth } from '~/composables/useAppAuth';

export default () => {
  const router = useRouter();
  const { state, checkStatus } = useAppAuth();

  async function checkLogin(): Promise<boolean> {
    // 状态尚未确认时，先查询一次
    if (state.value.loading) {
      await checkStatus();
    }

    if (!state.value.authenticated) {
      await router.push('/signin');
      return false;
    }
    return true;
  }

  return {
    checkLogin,
  };
};
