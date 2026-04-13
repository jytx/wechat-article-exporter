/**
 * 认证相关 Composable
 */

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  authenticated: boolean;
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  // 认证状态
  const state = ref<AuthState>({
    authenticated: false,
    user: null,
    loading: true
  });

  /**
   * 检查登录状态
   */
  async function checkStatus(): Promise<boolean> {
    state.value.loading = true;

    try {
      const response = await $fetch('/api/auth/status');

      if (response.success) {
        state.value.authenticated = response.data.authenticated;
        state.value.user = response.data.user;
        return response.data.authenticated;
      }

      return false;
    } catch (error) {
      console.error('检查登录状态失败:', error);
      state.value.authenticated = false;
      state.value.user = null;
      return false;
    } finally {
      state.value.loading = false;
    }
  }

  /**
   * 登录
   */
  async function login(username: string, password: string): Promise<boolean> {
    try {
      const response = await $fetch('/api/auth/login', {
        method: 'POST',
        body: {
          username,
          password
        }
      });

      if (response.success) {
        state.value.authenticated = true;
        state.value.user = response.data.user;
        return true;
      }

      return false;
    } catch (error) {
      console.error('登录失败:', error);
      return false;
    }
  }

  /**
   * 登出
   */
  async function logout(): Promise<boolean> {
    try {
      await $fetch('/api/auth/logout', {
        method: 'POST'
      });

      state.value.authenticated = false;
      state.value.user = null;

      // 跳转到登录页
      await navigateTo('/login');

      return true;
    } catch (error) {
      console.error('登出失败:', error);
      return false;
    }
  }

  /**
   * 修改密码
   */
  async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    try {
      const response = await $fetch('/api/auth/change-password', {
        method: 'POST',
        body: {
          old_password: oldPassword,
          new_password: newPassword
        }
      });

      return response.success;
    } catch (error) {
      console.error('修改密码失败:', error);
      return false;
    }
  }

  /**
   * 确保已登录（用于路由守卫）
   */
  async function requireAuth(): Promise<boolean> {
    const authenticated = await checkStatus();

    if (!authenticated) {
      await navigateTo('/login');
      return false;
    }

    return true;
  }

  // 初始化时检查登录状态
  onMounted(() => {
    checkStatus();
  });

  return {
    state: readonly(state),
    checkStatus,
    login,
    logout,
    changePassword,
    requireAuth
  };
}
