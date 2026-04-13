import LoginModal from '~/components/modal/Login.vue';

export default () => {
  const modal = useModal();
  const router = useRouter();

  // 检查应用登录状态
  async function checkAppLogin(): Promise<boolean> {
    try {
      const response = await $fetch('/api/auth/status');
      return response.success || response.authenticated || false;
    } catch {
      return false;
    }
  }

  // 检查是否有登录信息
  async function checkLogin(): Promise<boolean> {
    // 只检查应用登录状态（auth-key cookie）
    const isLoggedIn = await checkAppLogin();

    if (!isLoggedIn) {
      // 未登录应用，跳转到登录页
      await router.push('/login');
      return false;
    }

    return true;
  }

  return {
    checkLogin,
  };
};
