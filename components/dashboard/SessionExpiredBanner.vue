<template>
  <!-- session 过期时显示的持久化提醒条，引导用户重新扫码登录 -->
  <ElAlert
    v-if="expired"
    class="rounded-none border-x-0 border-t-0"
    type="warning"
    :title="alertTitle"
    :description="alertDescription"
  >
    <template #default>
      <ElButton type="warning" size="small" class="mt-2" @click="relogin">重新扫码登录</ElButton>
    </template>
  </ElAlert>
</template>

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core';
import LoginModal from '~/components/modal/Login.vue';

const modal = useDialog();

// session 过期时间戳（秒），空字符串/无值表示未过期
const expiredAt = ref<string>('');
const expired = computed(() => !!expiredAt.value);

const alertTitle = computed(() => '公众号登录已过期，定时同步已暂停');
const alertDescription = computed(() => {
  if (!expiredAt.value) return '';
  // 时间戳是秒级
  const date = new Date(Number(expiredAt.value) * 1000);
  const timeStr = date.toLocaleString('zh-CN', { hour12: false });
  return `检测到登录态在 ${timeStr} 已失效。后台定时同步将无法拉取新文章，请重新扫码登录后恢复。`;
});

function relogin() {
  modal.open(LoginModal);
}

/**
 * 轮询 session 过期标志（每 60 秒一次）
 * 复用 settings KV 接口，后端在自动同步预检时写入/清除该 key
 */
async function checkExpired() {
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings',
      { query: { key: 'mp_session_expired_at' } },
    );
    expiredAt.value = resp?.success ? resp.data?.value || '' : '';
  } catch {
    // 静默失败，下次轮询再试
  }
}

// 立即检查一次，然后每 60 秒轮询
const { pause, resume } = useIntervalFn(checkExpired, 60_000);
onMounted(() => {
  checkExpired();
  resume();
});
onUnmounted(() => pause());
</script>
