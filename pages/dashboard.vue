<template>
  <div class="flex">
    <!-- 左侧边栏 -->
    <SideBar />

    <div class="flex flex-col flex-1 overflow-hidden h-screen">
      <!-- 顶部操作栏（毛玻璃） -->
      <div
        class="glass-nav flex h-[50px] flex-shrink-0 items-center justify-between px-6"
      >
        <div id="title"></div>
        <GlobalActions />
      </div>

      <!-- session 过期提醒（仅过期时渲染，否则无高度） -->
      <SessionExpiredBanner />

      <!-- 页面容器 -->
      <div class="flex-1 overflow-hidden">
        <NuxtPage />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalActions from '~/components/dashboard/Actions.vue';
import SessionExpiredBanner from '~/components/dashboard/SessionExpiredBanner.vue';
import SideBar from '~/components/dashboard/SideBar.vue';
</script>
