<script setup lang="ts">
/**
 * 设置页 —— 卡片式布局
 *
 * 左侧分类导航 + 右侧卡片内容。
 * 点击导航项切换显示对应的卡片，右侧不滚动，每次只展示一个设置项。
 */

import { websiteName } from '~/config';

useHead({
  title: `设置 | ${websiteName}`,
});

/** 导航项配置：图标 + 主题色 + 锚点 key + 文案 */
interface SettingNavItem {
  key: string;
  label: string;
  icon: string;
  color: string;
}

/** 导航项只读配置（与各卡片头部图标/颜色保持一致） */
const NAV_ITEMS: ReadonlyArray<SettingNavItem> = [
  { key: 'proxy', label: '代理节点', icon: 'i-lucide:globe', color: '#0071e3' },
  { key: 'export', label: '导出选项', icon: 'i-lucide:download', color: '#ff6b00' },
  { key: 'sync', label: '文章同步', icon: 'i-lucide:refresh-cw', color: '#30d158' },
  { key: 'notification', label: '消息通知', icon: 'i-lucide:bell', color: '#ff9f0a' },
  { key: 'subscription', label: '文章订阅', icon: 'i-lucide:newspaper', color: '#bf5af2' },
  { key: 'misc', label: '其他设置', icon: 'i-lucide:settings-2', color: '#6e6e73' },
  { key: 'security', label: '安全', icon: 'i-lucide:shield-check', color: '#ff3b30' },
];

/** 当前选中的导航项 key */
const activeKey = ref<string>('proxy');
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] font-bold" style="color: var(--text)">设置</h1>
    </Teleport>

    <div class="flex h-full overflow-hidden">
      <!-- 左侧分类导航 -->
      <aside
        class="w-52 shrink-0 h-full overflow-y-auto border-r"
        style="background-color: var(--surface); border-color: var(--hairline)"
      >
        <nav class="flex flex-col gap-0.5 p-3">
          <button
            v-for="item in NAV_ITEMS"
            :key="item.key"
            type="button"
            class="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 relative"
            :class="activeKey === item.key ? 'font-medium' : 'font-normal'"
            :style="
              activeKey === item.key
                ? { backgroundColor: 'var(--el-color-primary-light-9)', color: 'var(--accent)' }
                : { color: 'var(--text-body)' }
            "
            @click="activeKey = item.key"
          >
            <!-- 激活态左侧竖条 -->
            <span
              v-if="activeKey === item.key"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
              style="background-color: var(--accent)"
            />
            <!-- 图标 -->
            <UIcon
              :name="item.icon"
              class="size-[18px] shrink-0 transition-colors"
              :style="{ color: activeKey === item.key ? item.color : 'var(--text-3)' }"
            />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- 右侧卡片内容：每次只显示一个设置项，不滚动 -->
      <div class="flex-1 overflow-auto">
        <div class="p-6 max-w-4xl mx-auto">
          <SettingProxy v-show="activeKey === 'proxy'" />
          <SettingExport v-show="activeKey === 'export'" />
          <SettingSync v-show="activeKey === 'sync'" />
          <SettingNotification v-show="activeKey === 'notification'" />
          <SettingSubscription v-show="activeKey === 'subscription'" />
          <SettingMisc v-show="activeKey === 'misc'" />
          <SettingSecurity v-show="activeKey === 'security'" />
        </div>
      </div>
    </div>
  </div>
</template>
