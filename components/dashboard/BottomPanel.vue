<script setup lang="ts">
import { formatDistance } from 'date-fns';
import { request } from '#shared/utils/request';
import LoginModal from '~/components/modal/Login.vue';
import StorageUsage from '~/components/StorageUsage.vue';
import { IMAGE_PROXY } from '~/config';
import type { LogoutResponse } from '~/types/types';

defineProps<{
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'expand'): void;
}>();

const loginAccount = useLoginAccount();
const modal = useDialog();

const now = ref(new Date());
const distance = computed(() => {
  return (
    loginAccount.value &&
    formatDistance(new Date(loginAccount.value.expires), now.value, {
      includeSeconds: true,
      locale: {
        formatDistance: function (token, count, options) {
          if (now.value >= new Date(loginAccount.value.expires)) {
            window.clearInterval(timer);
            setTimeout(() => {
              loginAccount.value = null;
            }, 0);
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
const warning = computed(() => {
  const value = distance.value;
  return value === '已过期' || value.includes('分钟') || value.includes('秒');
});

function login() {
  modal.open(LoginModal);
}

const logoutBtnLoading = ref(false);

async function logout() {
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
  <!-- 统一 footer，展开/收起内容用 opacity + max-height 平滑过渡 -->
  <footer class="flex flex-col pt-3 border-t border-black/[0.07]">
    <!-- 头像区域：收起时纵向排列（头像在上，退出在下），展开时横向排列 -->
    <div
      class="flex items-center transition-all duration-300"
      :class="collapsed ? 'flex-col gap-2' : 'justify-center'"
    >
      <!-- 已登录 -->
      <template v-if="loginAccount">
        <!-- 头像（收起时可点击展开） -->
        <ElTooltip v-if="collapsed" :content="loginAccount.nickname || ''" placement="right">
          <img
            v-if="loginAccount.avatar"
            :src="IMAGE_PROXY + loginAccount.avatar"
            alt=""
            class="rounded-full size-9 ring-1 ring-gray-300 cursor-pointer"
            @click="emit('expand')"
          />
        </ElTooltip>
        <img
          v-else-if="loginAccount.avatar"
          :src="IMAGE_PROXY + loginAccount.avatar"
          alt=""
          class="rounded-full size-10 ring-1 ring-gray-300 flex-shrink-0"
        />
        <!-- 展开态文字（v-show 始终在 DOM，用 opacity 过渡避免弹出） -->
        <div
          class="overflow-hidden flex items-center transition-all duration-300 ease-out"
          :style="collapsed ? { opacity: 0, maxWidth: '0', margin: '0' } : { opacity: 1, maxWidth: '200px', flex: '1 1 auto' }"
        >
          <ElTooltip v-if="loginAccount.nickname" placement="top-start">
            <template #content>
              <span>{{ loginAccount.nickname }}</span>
            </template>
            <span class="whitespace-nowrap text-ellipsis overflow-hidden block ml-2">{{ loginAccount.nickname }}</span>
          </ElTooltip>
          <ElButton
            :loading="logoutBtnLoading"
            class="bg-slate-10 hover:bg-rose-500 disabled:bg-rose-500 flex-shrink-0"
            @click="logout"
          ><template #icon><UIcon name="i-heroicons-arrow-left-start-on-rectangle-16-solid" /></template>退出
          </ElButton>
        </div>
        <!-- 收起态退出按钮 -->
        <ElTooltip v-if="collapsed" content="退出登录" placement="right">
          <button
            :disabled="logoutBtnLoading"
            class="flex items-center justify-center size-8 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
            @click="logout"
          >
            <UIcon name="i-heroicons-arrow-left-start-on-rectangle-16-solid" class="size-[18px]" />
          </button>
        </ElTooltip>
      </template>
      <!-- 未登录 -->
      <template v-else>
        <div
          class="overflow-hidden transition-all duration-300 ease-out"
          :style="collapsed ? { opacity: 0, maxWidth: '0' } : { opacity: 1, maxWidth: '200px' }"
        >
          <ElButton @click="login">登录公众号</ElButton>
        </div>
        <button
          v-if="collapsed"
          class="flex items-center justify-center size-9 rounded-md bg-black/5 hover:bg-black/10 transition-colors"
          @click="login"
        >
          <UIcon name="i-heroicons-arrow-left-start-on-rectangle-16-solid" class="size-[18px] text-gray-500" />
        </button>
      </template>
    </div>

    <!-- 展开态：过期时间 + 存储用量（v-show + opacity 过渡） -->
    <div
      class="overflow-hidden transition-all duration-300 ease-out"
      :style="collapsed ? { opacity: 0, maxHeight: '0' } : { opacity: 1, maxHeight: '120px' }"
    >
      <div v-if="loginAccount" class="mt-3 text-sm">
        <span>登录信息过期时间还剩: </span>
        <span class="font-mono" :class="warning ? 'text-rose-500' : 'text-green-500'">{{ distance }}</span>
      </div>
      <StorageUsage />
    </div>
  </footer>
</template>
