<script setup lang="ts">
/**
 * 设置页 - 安全卡片（修改门禁密码）
 *
 * 流程：旧密码 + 新密码（NewPasswordFields）→ 提交 → 成功后其他设备会话失效、
 *       当前会话保持登录 → 返回首页 /dashboard。
 */

import NewPasswordFields from '~/components/auth/NewPasswordFields.vue';
import toastFactory from '~/composables/toast';
import { validatePasswordStrength } from '~/utils/password';

const { changePassword } = useAppAuth();
const toast = toastFactory();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const errorMsg = ref('');

const newPasswordFieldsRef = ref<InstanceType<typeof NewPasswordFields> | null>(null);

/** 校验并提交改密 */
async function handleSubmit(): Promise<void> {
  errorMsg.value = '';

  if (!oldPassword.value) {
    errorMsg.value = '请输入旧密码';
    return;
  }

  // 明文强度校验
  const strength = validatePasswordStrength(newPassword.value);
  if (!strength.valid) {
    errorMsg.value = strength.errors.join('；');
    return;
  }

  // 一致性校验
  const check = newPasswordFieldsRef.value?.validate();
  if (check && !check.ok) {
    errorMsg.value = check.errors.join('；');
    return;
  }

  saving.value = true;
  try {
    await changePassword(oldPassword.value, newPassword.value);
    toast.success('密码修改成功', '其他设备需要重新登录');
    // 清空表单
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    // 按需求：改密成功后退出到首页
    await navigateTo('/dashboard/account');
  } catch (error: unknown) {
    const msg =
      error && typeof error === 'object' && 'data' in error
        ? String((error as { data?: { message?: string } }).data?.message ?? '')
        : '';
    errorMsg.value = msg || '密码修改失败，请重试';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElCard>
    <template #header>
      <h3 class="text-2xl font-semibold">安全</h3>
      <p class="text-sm text-slate-10">
        修改应用的访问密码。修改后，其他设备的登录将自动失效，需要重新登录。
      </p>
    </template>

    <div class="max-w-[480px] space-y-5">
      <!-- 旧密码 -->
      <div>
        <label class="block text-sm font-medium mb-1.5" style="color: var(--text-body)">
          当前密码
        </label>
        <ElInput
          v-model="oldPassword"
          type="password"
          placeholder="请输入当前密码"
          size="large"
          show-password
        />
      </div>

      <!-- 新密码 + 确认密码 -->
      <NewPasswordFields
        ref="newPasswordFieldsRef"
        v-model:new-password="newPassword"
        v-model:confirm-password="confirmPassword"
      />

      <!-- 错误提示 -->
      <p
        v-if="errorMsg"
        class="text-sm flex items-center gap-1.5"
        style="color: var(--el-color-danger)"
      >
        <UIcon name="i-heroicons:exclamation-circle-20-solid" class="size-4" />
        {{ errorMsg }}
      </p>

      <!-- 提交 -->
      <div class="flex justify-end">
        <ElButton type="primary" size="large" :loading="saving" @click="handleSubmit">
          修改密码
        </ElButton>
      </div>
    </div>
  </ElCard>
</template>
