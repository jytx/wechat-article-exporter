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
    <!-- 动态背景层：流动光晕 + 网格点阵（纯 CSS，pointer-events 不挡交互） -->
    <div class="bg-aurora" aria-hidden="true">
      <span class="blob blob-1"></span>
      <span class="blob blob-2"></span>
      <span class="blob blob-3"></span>
      <span class="grid-dots"></span>
    </div>

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
/* ── 页面容器 ── */
.signin-page {
  position: relative;
  overflow: hidden;
  background: var(--bg);
}

/* ── 动态背景层：流动光晕 + 网格点阵 ── */
.bg-aurora {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 流动光晕（blob）：大尺寸高斯模糊圆，缓慢位移营造极光感 */
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
  will-change: transform;
}
/* 苹果蓝主光晕 */
.blob-1 {
  width: 520px;
  height: 520px;
  top: -120px;
  left: -80px;
  background: radial-gradient(circle, rgba(0, 113, 227, 0.85), transparent 70%);
  animation: drift-1 22s ease-in-out infinite;
}
/* 青色辅助光晕 */
.blob-2 {
  width: 460px;
  height: 460px;
  bottom: -140px;
  right: -60px;
  background: radial-gradient(circle, rgba(48, 209, 209, 0.7), transparent 70%);
  animation: drift-2 26s ease-in-out infinite;
}
/* 紫色点缀光晕 */
.blob-3 {
  width: 380px;
  height: 380px;
  top: 40%;
  left: 55%;
  background: radial-gradient(circle, rgba(120, 87, 255, 0.6), transparent 70%);
  animation: drift-3 30s ease-in-out infinite;
}

/* 网格点阵：细密圆点，增加科技质感，随背景同向漂浮 */
.grid-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(0, 113, 227, 0.16) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 80%);
  opacity: 0.6;
}

/* 光晕漂移动画（三个 blob 节奏错开，避免同步） */
@keyframes drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(80px, 60px) scale(1.12); }
}
@keyframes drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-70px, -50px) scale(1.08); }
}
@keyframes drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-50px, 70px) scale(1.15); }
}

/* ── 毛玻璃卡片：呼应 dashboard 的 glass-nav 质感 ── */
.signin-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 20px 60px rgba(0, 113, 227, 0.12), var(--sh-panel);
  border-radius: var(--r-panel);
  padding: 40px 36px;
  /* 入场动画：淡入 + 上浮 */
  animation: card-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes card-enter {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── 标题前的 Logo 徽标：呼吸光圈 ── */
.logo-mark {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent), var(--el-color-primary-light-3));
  color: #fff;
  box-shadow: 0 8px 20px rgba(0, 113, 227, 0.25);
  animation: logo-pulse 3s ease-in-out infinite;
}
@keyframes logo-pulse {
  0%, 100% { box-shadow: 0 8px 20px rgba(0, 113, 227, 0.25); }
  50% { box-shadow: 0 8px 28px rgba(0, 113, 227, 0.45); }
}

/* ── 暗色模式适配 ── */
@media (prefers-color-scheme: dark) {
  .signin-card {
    background: rgba(30, 30, 32, 0.72);
    border-color: rgba(255, 255, 255, 0.1);
  }
  .blob { opacity: 0.4; }
  .grid-dots {
    background-image: radial-gradient(rgba(120, 170, 255, 0.2) 1px, transparent 1px);
  }
}

/* ── 降低动态偏好：关闭所有动画，尊重无障碍 ── */
@media (prefers-reduced-motion: reduce) {
  .blob, .logo-mark { animation: none; }
  .signin-card { animation: none; }
}
</style>
