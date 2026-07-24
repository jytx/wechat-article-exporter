<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">设置</h1>
    </Teleport>

    <div class="flex flex-col h-full">
      <!-- 顶部提示：修改后自动保存 -->
      <header class="flex items-center justify-end gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <UIcon name="i-lucide:check-circle" class="size-4 text-green-500" />
        <span class="text-sm text-gray-500">修改后自动保存</span>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-4 space-y-6">
          <!-- 代理节点 -->
          <SettingProxy />

          <!-- 导出选项 -->
          <SettingExport />

          <!-- 文章同步 -->
          <SettingSync />

          <!-- 消息通知 -->
          <SettingNotification ref="notificationRef" />

          <!-- 文章订阅 -->
          <SettingSubscription ref="subscriptionRef" />

          <!-- 其他设置 -->
          <SettingMisc />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';

useHead({
  title: `设置 | ${websiteName}`,
});
</script>
