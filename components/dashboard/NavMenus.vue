<script setup lang="ts">
interface NavItem {
  name: string;
  icon: string;
  href: string;
  insider?: boolean;
  tags?: string[];
}

const items = ref<NavItem[]>([
  { name: '公众号管理', icon: 'i-lucide:users', href: '/dashboard/account' },
  { name: '文章下载', icon: 'i-lucide:file-down', href: '/dashboard/article' },
  { name: '选题雷达', icon: 'i-lucide:radar', href: '/dashboard/hot' },
  { name: '单篇文章下载', icon: 'i-lucide:file-text', href: '/dashboard/single' },
  { name: '合集下载', icon: 'i-lucide:library-big', href: '/dashboard/album' },
  // { name: '公共代理', icon: 'i-lucide:globe', href: '/dashboard/proxy' },
  { name: 'API', icon: 'i-lucide:cable', href: '/dashboard/api' },
  { name: '操作日志', icon: 'i-lucide:scroll-text', href: '/dashboard/logs' },
  { name: '设置', icon: 'i-lucide:settings', href: '/dashboard/settings' },
  // { name: '技术支持 & 赞助', icon: 'i-lucide:heart-handshake', href: '/dashboard/support' },
]);
</script>

<template>
  <nav class="flex-1 mt-6">
    <ul class="flex flex-col gap-1">
      <li v-for="item in items" :key="item.name">
        <NuxtLink :to="item.href" class="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm nav-link transition-colors duration-150">
          <UIcon :name="item.icon" class="size-[18px] opacity-70" />
          <p>{{ item.name }}</p>
          <ElTag v-if="item.tags" v-for="tag in item.tags" type="primary" effect="light">{{ tag }}</ElTag>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* 苹果风：激活态用浅蓝底 + 蓝色文字；非激活用灰阶，悬停浅灰 */
.nav-link.router-link-active {
  background-color: rgba(0,113,227,0.08);
  color: var(--accent, #0071e3);
  font-weight: 600;
}
.nav-link.router-link-active :deep(.iconify) {
  opacity: 1;
}
.nav-link:not(.router-link-active) {
  color: var(--text-2, #6e6e73);
}
.nav-link:not(.router-link-active):hover {
  background-color: rgba(0,0,0,0.04);
  color: var(--text, #1d1d1f);
}
</style>
