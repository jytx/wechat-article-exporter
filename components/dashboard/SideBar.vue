<script setup lang="ts">
import BottomPanel from '~/components/dashboard/BottomPanel.vue';
import NavMenus from '~/components/dashboard/NavMenus.vue';
import { websiteName } from '~/config';

const { collapsed, toggle } = useSidebarCollapse();
</script>

<template>
  <aside
    class="glass-sidebar hidden md:flex flex-col h-screen flex-shrink-0 justify-between border-r border-black/[0.07] pb-6 transition-all duration-300 ease-out overflow-hidden"
    :class="collapsed ? 'w-[64px] px-2' : 'w-[250px] px-4'"
  >
    <!-- 网站标题 & Logo + 折叠按钮 -->
    <div class="flex items-center h-[60px]" :class="collapsed ? 'justify-center' : 'justify-between'">
      <NuxtLink v-if="!collapsed" to="/" class="px-2 font-bold text-xl">{{ websiteName }}</NuxtLink>
      <NuxtLink v-else to="/" class="font-bold text-xl">{{ websiteName.charAt(0) }}</NuxtLink>
      <button
        v-if="!collapsed"
        class="flex items-center justify-center size-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
        title="收起侧边栏"
        @click="toggle"
      >
        <UIcon name="i-heroicons:chevron-double-left-20-solid" class="size-4" />
      </button>
    </div>

    <!-- 导航菜单 -->
    <NavMenus :collapsed="collapsed" />

    <!-- 底部视图 -->
    <BottomPanel :collapsed="collapsed" @expand="toggle" />
  </aside>
</template>
