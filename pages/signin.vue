<script setup lang="ts">
/**
 * 应用门禁页 /signin
 *
 * 两个视图：
 *  1. 登录视图（login）：单密码框，验证通过后：
 *     - 若为初始默认密码 → 切换到「首次设密」视图（强制改密）
 *     - 否则 → 跳转 /dashboard/account
 *  2. 首次设密视图（setup）：使用 NewPasswordFields 组件，设密成功后跳转首页。
 *
 * 安全：密码提交前先经 derivePasswordForTransport 派生，不传输明文。
 */

import NewPasswordFields from '~/components/auth/NewPasswordFields.vue';
import { validatePasswordStrength } from '~/utils/password';
import { websiteName } from '~/config';

definePageMeta({ layout: false });

useHead({ title: `登录 | ${websiteName}` });

const { login, changePassword } = useAppAuth();

type View = 'login' | 'setup';
const view = ref<View>('login');

// 登录视图状态
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

// 设密视图状态
const newPassword = ref('');
const confirmPassword = ref('');
const newPasswordFieldsRef = ref<InstanceType<typeof NewPasswordFields> | null>(null);
const setupLoading = ref(false);
const setupError = ref('');

/**
 * 处理登录
 */
async function handleLogin(): Promise<void> {
  errorMsg.value = '';

  if (!password.value) {
    errorMsg.value = '请输入密码';
    return;
  }

  loading.value = true;
  try {
    const isInitial = await login(password.value);
    if (isInitial) {
      // 初始密码，强制切换到设密视图。
      // 保留 password 作为「当前密码」供设密时校验旧密码（changePassword 需要旧密码）。
      view.value = 'setup';
    } else {
      await navigateTo('/dashboard/account');
    }
  } catch (error: unknown) {
    errorMsg.value = extractErrorMessage(error) ?? '登录失败，请重试';
  } finally {
    loading.value = false;
  }
}

/**
 * 处理首次设密
 */
async function handleSetup(): Promise<void> {
  setupError.value = '';

  // 先对明文做强度校验
  const strength = validatePasswordStrength(newPassword.value);
  if (!strength.valid) {
    setupError.value = strength.errors.join('；');
    return;
  }
  // 再走组件的一致性校验
  const check = newPasswordFieldsRef.value?.validate();
  if (check && !check.ok) {
    setupError.value = check.errors.join('；');
    return;
  }

  setupLoading.value = true;
  try {
    // password 为登录时验证过的初始密码，作为旧密码传入
    await changePassword(password.value, newPassword.value);
    await navigateTo('/dashboard/account');
  } catch (error: unknown) {
    setupError.value = extractErrorMessage(error) ?? '设密失败，请重试';
  } finally {
    setupLoading.value = false;
  }
}

/**
 * 从错误对象中提取后端返回的 message
 */
function extractErrorMessage(error: unknown): string | null {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'message' in error.data
  ) {
    return String((error as { data: { message: string } }).data.message);
  }
  return null;
}
</script>

<template>
  <div class="signin-page min-h-[100dvh] flex items-center justify-center px-4">
    <!-- 门禁卡片 -->
    <div class="signin-card w-full max-w-[400px]">
      <!-- 标题区 -->
      <div class="text-center mb-8">
        <div class="logo-mark mx-auto mb-4">
          <UIcon name="i-heroicons:lock-closed-20-solid" class="size-7" />
        </div>
        <h1 class="text-[26px] font-semibold" style="color: var(--text); letter-spacing: -0.02em;">
          {{ websiteName }}
        </h1>
        <p class="mt-1.5 text-sm" style="color: var(--text-2)">
          <template v-if="view === 'login'">请输入访问密码</template>
          <template v-else>首次使用，请设置新密码</template>
        </p>
      </div>

      <!-- 登录视图 -->
      <form v-if="view === 'login'" class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <ElInput
            v-model="password"
            type="password"
            placeholder="访问密码"
            size="large"
            show-password
            autofocus
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <UIcon name="i-heroicons:key-20-solid" class="size-5 text-gray-400" />
            </template>
          </ElInput>
        </div>

        <p v-if="errorMsg" class="text-sm flex items-center gap-1.5" style="color: var(--el-color-danger)">
          <UIcon name="i-heroicons:exclamation-circle-20-solid" class="size-4" />
          {{ errorMsg }}
        </p>

        <ElButton
          type="primary"
          size="large"
          class="w-full"
          :loading="loading"
          native-type="submit"
        >
          登录
        </ElButton>
      </form>

      <!-- 首次设密视图 -->
      <form v-else class="space-y-4" @submit.prevent="handleSetup">
        <NewPasswordFields
          ref="newPasswordFieldsRef"
          v-model:new-password="newPassword"
          v-model:confirm-password="confirmPassword"
        />

        <div
          class="text-xs leading-relaxed p-3 rounded-lg"
          style="background: var(--el-color-primary-light-9); color: var(--text-2)"
        >
          <UIcon name="i-heroicons:information-circle-20-solid" class="size-4 align-text-bottom mr-1" style="color: var(--accent)" />
          首次登录需设置新密码。设置后，其他设备的登录将自动失效。
        </div>

        <p v-if="setupError" class="text-sm flex items-center gap-1.5" style="color: var(--el-color-danger)">
          <UIcon name="i-heroicons:exclamation-circle-20-solid" class="size-4" />
          {{ setupError }}
        </p>

        <ElButton
          type="primary"
          size="large"
          class="w-full"
          :loading="setupLoading"
          native-type="submit"
        >
          设置新密码并进入
        </ElButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 门禁页底色：比 dashboard 略深的冷灰，衬托毛玻璃卡片 */
.signin-page {
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(0, 113, 227, 0.06), transparent 60%),
    var(--bg);
}

/* 毛玻璃卡片：呼应 dashboard 的 glass-nav 质感 */
.signin-card {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: var(--sh-panel);
  border-radius: var(--r-panel);
  padding: 40px 36px;
}

/* 标题前的小 Logo 圆形徽标 */
.logo-mark {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent), var(--el-color-primary-light-3));
  color: #fff;
  box-shadow: 0 8px 20px rgba(0, 113, 227, 0.25);
}

@media (prefers-color-scheme: dark) {
  .signin-card {
    background: rgba(30, 30, 32, 0.72);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
