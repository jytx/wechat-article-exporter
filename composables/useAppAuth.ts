/**
 * 应用门禁前端鉴权 Composable
 *
 * 提供应用级共享的门禁状态（通过 useState 在所有组件间共享），
 * 以及登录 / 登出 / 改密 / 状态检查 等方法。
 *
 * 安全：所有密码均在调用方先经 derivePasswordForTransport 派生后再传入本 composable，
 * 网络上不传输明文。
 */

import { derivePasswordForTransport } from '~/utils/password';

/** 门禁共享状态 */
interface AppAuthState {
  /** 是否已通过门禁 */
  authenticated: boolean;
  /** 是否正在请求中（用于守卫首次加载判断） */
  loading: boolean;
  /** 是否为初始默认密码（需强制改密） */
  isInitial: boolean;
}

/** 默认状态 */
function defaultState(): AppAuthState {
  return { authenticated: false, loading: true, isInitial: false };
}

export function useAppAuth() {
  // 应用级共享状态（key 固定，保证跨组件同一实例）
  const state = useState<AppAuthState>('app-auth', defaultState);

  /**
   * 查询当前门禁状态（依据 app_token cookie 是否有效）
   */
  async function checkStatus(): Promise<boolean> {
    state.value.loading = true;
    try {
      const res = await $fetch<{ success: boolean; data: { authenticated: boolean } }>(
        '/api/app-auth/status',
      );
      const authenticated = Boolean(res?.data?.authenticated);
      state.value.authenticated = authenticated;
      return authenticated;
    } catch {
      state.value.authenticated = false;
      return false;
    } finally {
      state.value.loading = false;
    }
  }

  /**
   * 登录
   * @param rawPassword 原始明文密码（本函数内派生后传输，不外泄明文）
   * @returns isInitial 标记；登录失败抛错
   */
  async function login(rawPassword: string): Promise<boolean> {
    const derived = await derivePasswordForTransport(rawPassword);
    const res = await $fetch<{
      success: boolean;
      data: { isInitial: boolean };
    }>('/api/app-auth/login', {
      method: 'POST',
      body: { passwordDerived: derived },
    });

    if (!res?.success) {
      throw new Error('登录失败');
    }

    state.value.authenticated = true;
    state.value.isInitial = res.data.isInitial;
    return res.data.isInitial;
  }

  /**
   * 修改密码（设置页 / 首次设密共用）
   * 改密成功后会话保持登录态（服务端已换发新 token）。
   * @param oldRawPassword 旧明文密码
   * @param newRawPassword 新明文密码
   */
  async function changePassword(
    oldRawPassword: string,
    newRawPassword: string,
  ): Promise<void> {
    const oldDerived = await derivePasswordForTransport(oldRawPassword);
    const newDerived = await derivePasswordForTransport(newRawPassword);

    const res = await $fetch<{
      success: boolean;
      data: { isInitial: boolean };
    }>('/api/app-auth/change-password', {
      method: 'POST',
      body: { oldDerived, newDerived },
    });

    if (!res?.success) {
      throw new Error('修改密码失败');
    }
    // 改密成功后，不再是初始密码
    state.value.isInitial = res.data.isInitial;
  }

  /**
   * 登出
   */
  async function logout(): Promise<void> {
    try {
      await $fetch('/api/app-auth/logout', { method: 'POST' });
    } finally {
      state.value.authenticated = false;
      state.value.isInitial = false;
      await navigateTo('/signin');
    }
  }

  return {
    state: readonly(state),
    checkStatus,
    login,
    logout,
    changePassword,
  };
}
