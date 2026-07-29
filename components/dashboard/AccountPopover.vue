<script setup lang="ts">
/**
 * 账号悬浮卡片
 *
 * 位于左上角网站标题后方。
 * - 已登录：显示公众号头像，鼠标悬浮展示下拉卡片（昵称、登录过期时间、数据库占用、退出）
 * - 未登录：显示「登录」按钮
 */

import { formatDistance } from 'date-fns';
import { request } from '#shared/utils/request';
import LoginModal from '~/components/modal/Login.vue';
import StorageUsage from '~/components/StorageUsage.vue';
import { IMAGE_PROXY } from '~/config';
import type { LogoutResponse } from '~/types/types';

const loginAccount = useLoginAccount();
const modal = useDialog();

const now = ref(new Date());

/**
 * 计算登录态剩余时间的中文文案（纯函数，不修改外部状态）。
 * 过期时通过外部 effect 清理 loginAccount。
 */
const distance = computed(() => {
  if (!loginAccount.value) return '';
  return (
    loginAccount.value &&
    formatDistance(new Date(loginAccount.value.expires), now.value, {
      includeSeconds: true,
      locale: {
        formatDistance: function (token, count) {
          if (now.value >= new Date(loginAccount.value!.expires)) {
            return '已过期';
          }
          switch (token) {
            case 'aboutXHours':
              return '大约' + count + '个小时';
            case 'aboutXMonths':
              return '大约' + count + '个月';
            case 'aboutXWeeks':
              return '大约' + count + '周';
            case 'aboutXYears':
              return '大约' + count + '年';
            case 'lessThanXMinutes':
              return '小于' + count + '分钟';
            case 'almostXYears':
              return '接近' + count + '年';
            case 'halfAMinute':
              return '半分钟';
            case 'lessThanXSeconds':
              return '小于' + count + '秒';
            case 'overXYears':
              return '超过' + count + '年';
            case 'xDays':
              return count + '天';
            case 'xHours':
              return count + '个小时';
            case 'xMinutes':
              return count + '分钟';
            case 'xMonths':
              return count + '个月';
            case 'xSeconds':
              return count + '秒';
            case 'xWeeks':
              return count + '周';
            case 'xYears':
              return count + '年';
            default:
              return 'unknown';
          }
        },
      },
    })
  );
});

/** 是否临近过期（分钟/秒级或已过期）*/
const warning = computed(() => {
  const value = distance.value;
  return value === '已过期' || value.includes('分钟') || value.includes('秒');
});

/** 已过期时清理登录态（在独立 watch 中处理副作用，保持 distance 为纯计算） */
watch(distance, (value) => {
  if (value === '已过期') {
    loginAccount.value = null;
  }
});

function login(): void {
  modal.open(LoginModal);
}

const logoutBtnLoading = ref(false);

/** 退出微信公众号登录 */
async function logout(): Promise<void> {
  logoutBtnLoading.value = true;
  const { statusCode, statusText } = await request<LogoutResponse>('/api/web/mp/logout');
  if (statusCode === 200) {
    loginAccount.value = null;
  } else {
    alert(statusText);
  }
  logoutBtnLoading.value = false;
}

let timer: number;
onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});
onUnmounted(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <!-- 未登录：单个登录图标（与操作栏其他图标风格统一） -->
  <ElTooltip v-if="!loginAccount" content="登录公众号">
    <UIcon
      name="i-heroicons:chat-bubble-left"
      class="size-7 text-zinc-400 hover:text-blue-500 cursor-pointer transition-colors"
      @click="login"
    />
  </ElTooltip>

  <!-- 已登录：头像 + 悬浮下拉卡片 -->
  <ElPopover v-else trigger="hover" placement="bottom-start" :width="240" :offset="8">
    <template #reference>
      <div class="flex items-center cursor-pointer">
        <img
          v-if="loginAccount.avatar"
          :src="IMAGE_PROXY + loginAccount.avatar"
          :alt="loginAccount.nickname || ''"
          class="rounded-full size-7 ring-1 ring-gray-300 hover:ring-[#0071e3] transition-all shrink-0"
        />
        <!-- 无头像时的占位 -->
        <div
          v-else
          class="rounded-full size-7 ring-1 ring-gray-300 hover:ring-[#0071e3] transition-all shrink-0 flex items-center justify-center bg-gray-100 text-gray-400"
        >
          <UIcon name="i-heroicons:chat-bubble-left" class="size-5" />
        </div>
      </div>
    </template>

    <!-- 悬浮卡片内容 -->
    <div class="flex flex-col gap-3">
      <!-- 昵称 -->
      <div class="flex items-center gap-2 pb-2 border-b" style="border-color: var(--hairline)">
        <img
          v-if="loginAccount.avatar"
          :src="IMAGE_PROXY + loginAccount.avatar"
          alt=""
          class="rounded-full size-8 ring-1 ring-gray-300"
        />
        <span class="text-sm font-medium truncate" style="color: var(--text)">
          {{ loginAccount.nickname || '未命名' }}
        </span>
      </div>

      <!-- 登录过期时间 -->
      <div class="text-sm flex items-center justify-between">
        <span style="color: var(--text-2)">登录过期还剩</span>
        <span
          class="font-mono font-medium"
          :style="{ color: warning ? 'var(--el-color-danger)' : 'var(--el-color-success)' }"
        >
          {{ distance }}
        </span>
      </div>

      <!-- 数据库占用 -->
      <StorageUsage />

      <!-- 退出登录 -->
      <ElButton
        size="small"
        :loading="logoutBtnLoading"
        class="w-full"
        @click="logout"
      >
        <template #icon><UIcon name="i-heroicons-arrow-left-start-on-rectangle-16-solid" /></template>
        退出登录
      </ElButton>
    </div>
  </ElPopover>
</template>
