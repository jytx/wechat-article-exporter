<template>
  <!--
    文章预览面板：作为搜索抽屉的右栏，二级选择式展示文章正文。
    通过 iframe srcdoc 渲染后端抓取的 HTML，绕过微信 CSP frame-ancestors 限制。
  -->
  <aside class="flex h-full flex-1 flex-col border-l border-gray-200 dark:border-gray-800">
    <!-- 头部：标题 + 操作按钮 -->
    <header
      class="flex h-[60px] flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 dark:border-gray-800"
    >
      <h3 class="line-clamp-1 flex-1 text-sm font-medium" :title="title">
        <span v-if="loading" class="text-gray-400">加载中...</span>
        <span v-else-if="!hasArticle" class="text-gray-400">未选择文章</span>
        <span v-else>{{ title }}</span>
      </h3>

      <div v-if="hasArticle" class="flex flex-shrink-0 items-center gap-1">
        <ElButton size="small" text title="在新标签页打开原文" @click="openExternal(url)">
          <template #icon><UIcon name="i-lucide:external-link" /></template>
        </ElButton>
        <ElButton size="small" text title="关闭预览" @click="emit('close')">
          <template #icon><UIcon name="i-lucide:x" /></template>
        </ElButton>
      </div>
    </header>

    <!-- 内容区 -->
    <div class="relative flex-1 overflow-hidden bg-white dark:bg-gray-900">
      <!-- 空状态引导 -->
      <div
        v-if="!hasArticle && !loading"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-gray-400"
      >
        <UIcon name="i-lucide:newspaper" class="text-5xl text-gray-300" />
        <p class="text-sm">点击左侧文章的「预览」按钮</p>
        <p class="text-xs text-gray-400">即可在此处查看文章正文</p>
      </div>

      <!-- 加载中 -->
      <div v-else-if="loading" class="absolute inset-0 flex items-center justify-center text-gray-400">
        <Loader :size="28" class="animate-spin" />
      </div>

      <!-- 预览失败 -->
      <div
        v-else-if="error"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-gray-500"
      >
        <p>预览失败</p>
        <p class="text-xs text-gray-400">{{ error }}</p>
        <ElButton
          size="small"
          type="primary"
          plain
          class="mt-2"
          @click="openExternal(url)"
        >在新标签页打开原文</ElButton>
      </div>

      <!-- 正文（iframe srcdoc 渲染，sandbox 限制权限保证安全） -->
      <iframe
        v-else-if="html"
        :srcdoc="html"
        class="h-full w-full border-0"
        sandbox="allow-same-origin allow-popups"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Loader } from 'lucide-vue-next';
import { computed } from 'vue';

/** 预览面板的入参：由父组件提供文章正文与加载状态 */
interface Props {
  /** 文章标题（加载中/无文章时由面板自处理占位） */
  title: string;
  /** 文章原文链接，同时作为「是否有文章」的判定依据 */
  url: string;
  /** 后端抓取到的正文 HTML */
  html: string;
  /** 是否正在加载正文 */
  loading: boolean;
  /** 加载失败时的错误信息 */
  error: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'close'): void }>();

/** 是否已有选中文章（以 url 为准） */
const hasArticle = computed<boolean>(() => !!props.url);

/** 在新标签页打开原文（安全：noopener 防止反向引用） */
function openExternal(url: string): void {
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
</script>
