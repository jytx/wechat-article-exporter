<script setup lang="ts">
import type { ChipColor } from '#ui/types';
import AccountPopover from '~/components/dashboard/AccountPopover.vue';
import CredentialsDialog, { type CredentialState } from '~/components/global/CredentialsDialog.vue';
import { docsWebSite } from '~/config';
import { gotoLink } from '~/utils';

// 退出应用门禁，返回登录页
const { logout: appLogout } = useAppAuth();

// CredentialDialog 相关变量
const credentialsDialogOpen = ref(false);
const credentialState = ref<CredentialState>('inactive');
const credentialPendingCount = ref(0);
const credentialColor: ComputedRef<ChipColor> = computed<ChipColor>(() => {
  switch (credentialState.value) {
    case 'active':
      return 'green';
    case 'inactive':
      return 'gray';
    case 'warning':
      return 'amber';
    default:
      return 'gray';
  }
});

const credentialBadgeText = computed(() => {
  const count = credentialPendingCount.value;
  if (count <= 0) return '';
  return count > 9 ? '+' : `${count}`;
});
const isCredentialActive = computed(() => credentialState.value === 'active');
</script>

<template>
  <ul class="hidden md:flex items-center gap-5">
    <!-- 通知 -->
    <!--    <li>-->
    <!--      <ElTooltip content="通知">-->
    <!--        <ElBadge :value="3" type="warning">-->
    <!--          <UIcon name="i-lucide:bell" class="action-icon" />-->
    <!--        </ElBadge>-->
    <!--      </ElTooltip>-->
    <!--    </li>-->

    <!-- Credential -->
    <li class="flex items-center">
      <ElTooltip content="抓取 Credentials">
        <span class="relative inline-flex">
          <UIcon
            @click="credentialsDialogOpen = true"
            name="i-heroicons:identification"
            :class="[
              'size-7 cursor-pointer transition-colors',
              { 'text-zinc-400 hover:text-blue-500': !isCredentialActive },
              { 'text-green-500 hover:text-green-600': isCredentialActive },
            ]"
          />
          <span
            v-if="credentialBadgeText"
            class="absolute -top-1 -right-1 text-[10px] leading-none rounded-full bg-rose-500 text-white px-1.5 py-0.5 min-w-[16px] text-center"
          >
            {{ credentialBadgeText }}
          </span>
        </span>
      </ElTooltip>
    </li>

    <!-- 文档 -->
    <li class="flex items-center">
      <ElTooltip content="文档">
        <UIcon
          name="i-heroicons:book-open"
          @click="gotoLink(docsWebSite)"
          class="size-7 text-zinc-400 hover:text-blue-500 cursor-pointer transition-colors"
        />
      </ElTooltip>
    </li>

    <!-- 公众号账号（头像 + 悬浮信息卡片） -->
    <li class="flex items-center">
      <AccountPopover />
    </li>

    <!-- 退出应用（返回登录页） -->
    <li class="flex items-center">
      <ElTooltip content="退出应用">
        <UIcon
          name="i-heroicons:arrow-left-start-on-rectangle"
          class="size-7 text-zinc-400 hover:text-blue-500 cursor-pointer transition-colors"
          @click="appLogout"
        />
      </ElTooltip>
    </li>

  </ul>

  <!-- 抽屉组件（脱离操作栏布局流，仅通过 v-model:open 控制） -->
  <CredentialsDialog
    v-model:open="credentialsDialogOpen"
    v-model:state="credentialState"
    @update:pending-count="credentialPendingCount = $event"
  />
</template>
