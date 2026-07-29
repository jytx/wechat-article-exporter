<script setup lang="ts">
/**
 * 新密码 + 确认密码输入组件（门禁页首次设密 / 设置页改密共用）
 *
 * 功能：
 *  - 双向绑定新密码（v-model:newPassword）与确认密码（v-model:confirmPassword）
 *  - 实时强度校验（长度、字母、数字）与「两次输入一致」校验
 *  - 显隐密码切换
 *  - 通过 defineExpose 暴露 validate()，供父组件提交前统一校验
 *
 * 复用：Element Plus 输入框、apple-theme 颜色变量、UIcon 图标。
 */

import { validatePasswordStrength } from '~/utils/password';

const newPassword = defineModel<string>('newPassword', { required: true });
const confirmPassword = defineModel<string>('confirmPassword', { required: true });

/** 强度校验结果 */
const strengthCheck = computed(() => validatePasswordStrength(newPassword.value));

/** 两次是否一致 */
const isMatch = computed(
  () =>
    confirmPassword.value.length > 0 && newPassword.value === confirmPassword.value,
);

/** 确认框是否不一致（仅在确认框有内容时提示） */
const confirmError = computed(() => {
  if (confirmPassword.value.length === 0) {
    return false;
  }
  return newPassword.value !== confirmPassword.value;
});

/** 整体是否可提交 */
const valid = computed(
  () => strengthCheck.value.valid && isMatch.value,
);

/** 供父组件调用的统一校验，返回是否通过 */
function validate(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!strengthCheck.value.valid) {
    errors.push(...strengthCheck.value.errors);
  }
  if (!isMatch.value) {
    errors.push('两次输入的密码不一致');
  }
  return { ok: errors.length === 0, errors };
}

defineExpose({ validate });
</script>

<template>
  <div class="space-y-4">
    <!-- 新密码 -->
    <div>
      <label class="block text-sm font-medium mb-1.5" style="color: var(--text-body)">
        新密码
      </label>
      <ElInput
        v-model="newPassword"
        type="password"
        placeholder="请输入新密码（至少 8 位，含字母和数字）"
        size="large"
        show-password
      />

      <!-- 实时强度提示 -->
      <ul v-if="newPassword.length > 0" class="mt-2 space-y-1 text-xs">
        <li
          v-for="rule in [
            { ok: newPassword.length >= 8, text: '至少 8 位' },
            { ok: /[a-zA-Z]/.test(newPassword), text: '包含字母' },
            { ok: /[0-9]/.test(newPassword), text: '包含数字' },
          ]"
          :key="rule.text"
          class="flex items-center gap-1.5 transition-colors"
          :style="{ color: rule.ok ? 'var(--live)' : 'var(--text-3)' }"
        >
          <UIcon
            :name="rule.ok ? 'i-heroicons:check-circle-20-solid' : 'i-heroicons:circle-20-solid'"
            class="size-3.5"
          />
          {{ rule.text }}
        </li>
      </ul>
    </div>

    <!-- 确认密码 -->
    <div>
      <label class="block text-sm font-medium mb-1.5" style="color: var(--text-body)">
        确认新密码
      </label>
      <ElInput
        v-model="confirmPassword"
        type="password"
        placeholder="请再次输入新密码"
        size="large"
        show-password
        :class="confirmError ? 'confirm-error' : ''"
      />
      <p
        v-if="confirmError"
        class="mt-1.5 text-xs flex items-center gap-1"
        style="color: var(--el-color-danger)"
      >
        <UIcon name="i-heroicons:x-circle-20-solid" class="size-3.5" />
        两次输入的密码不一致
      </p>
      <p
        v-else-if="isMatch"
        class="mt-1.5 text-xs flex items-center gap-1"
        style="color: var(--live)"
      >
        <UIcon name="i-heroicons:check-circle-20-solid" class="size-3.5" />
        两次输入一致
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 确认不一致时输入框描红（Element Plus 不便直接 class 控制，用深度选择器） */
.confirm-error :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
