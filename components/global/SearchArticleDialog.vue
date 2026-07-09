<template>
  <!-- 搜索抽屉 -->
  <USlideover v-model="isOpen" side="left" :ui="{ overlay: { background: 'bg-zinc-400/75' } }">
    <div
      ref="scrollContainerRef"
      class="w-96 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 shadow bg-white dark:bg-gray-900 flex flex-col flex-1 overflow-y-scroll"
      @scroll="onScroll"
    >
      <div class="sticky top-0 bg-white py-4 px-2 shadow dark:bg-gray-900 z-10">
        <SearchArticleForm ref="searchFormRef" v-model="articleQuery" @search="searchArticle" />
        <p v-if="!loading && articleList.length > 0" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          找到 {{ totalArticles }} 篇相关文章
        </p>
      </div>

      <!-- 文章列表 -->
      <div class="flex-1">
        <ul class="divide-y antialiased">
          <li
            v-for="article in articleList"
            :key="article.aid"
            class="flex flex-col gap-2 px-2 py-4 hover:bg-slate-50 hover:cursor-pointer group"
            @click="selectArticle(article)"
          >
            <div class="flex justify-between items-start">
              <p class="font-medium line-clamp-2 flex-1" v-text="article.title"></p>
              <p v-if="article.create_time_formatted" class="text-sky-500 text-xs ml-2 whitespace-nowrap" v-text="article.create_time_formatted"></p>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-gray-500 text-xs">
                {{ article.account_nickname || '未知公众号' }}
              </p>
              <!-- 预览按钮：点击预览（不选中），阻止冒泡避免触发 selectArticle -->
              <UButton
                icon="i-lucide:eye"
                size="xs"
                color="gray"
                variant="ghost"
                :padded="false"
                class="opacity-0 group-hover:opacity-100"
                title="预览文章内容"
                @click.stop="previewArticle(article)"
              />
            </div>
            <p v-if="article.digest" class="text-gray-400 text-xs line-clamp-2">{{ article.digest }}</p>
          </li>
        </ul>

        <p v-if="loading" class="flex justify-center items-center my-2 py-2">
          <Loader :size="28" class="animate-spin text-slate-500" />
        </p>
        <p v-else-if="!loading && articleList.length === 0 && hasSearched" class="text-center mt-2 py-2 text-slate-400">
          未找到相关文章，请尝试其他关键词
        </p>
        <p v-else-if="noMoreData && articleList.length > 0" class="text-center mt-2 py-2 text-slate-400">
          已全部加载完毕
        </p>
      </div>
    </div>
  </USlideover>

  <!-- 预览面板（固定定位，独立于 USlideover，避免事件连锁导致搜索抽屉一起关闭） -->
  <Teleport to="body">
    <div
      v-if="isPreviewOpen"
      class="fixed inset-y-0 right-0 z-[60] w-full max-w-[760px] shadow-2xl bg-white dark:bg-gray-900 flex flex-col"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <h3 class="text-sm font-medium line-clamp-1 flex-1" :title="previewTitle">
          <span v-if="previewLoading" class="text-gray-400">加载中...</span>
          <span v-else>{{ previewTitle }}</span>
        </h3>
        <div class="flex items-center gap-1 flex-shrink-0">
          <UButton
            icon="i-lucide:external-link"
            size="xs"
            color="gray"
            variant="ghost"
            :to="previewUrl"
            target="_blank"
            title="在新标签页打开原文"
          />
          <UButton icon="i-lucide:x" size="xs" color="gray" variant="ghost" @click="isPreviewOpen = false" title="关闭预览" />
        </div>
      </div>
      <!-- 内容区 -->
      <div class="flex-1 w-full bg-white relative overflow-hidden">
        <div v-if="previewLoading" class="absolute inset-0 flex items-center justify-center text-gray-400">
          <Loader :size="28" class="animate-spin" />
        </div>
        <div v-else-if="previewError" class="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2 p-8 text-center">
          <p>预览失败</p>
          <p class="text-xs text-gray-400">{{ previewError }}</p>
          <UButton :to="previewUrl" target="_blank" size="xs" color="blue" variant="soft" class="mt-2">在新标签页打开原文</UButton>
        </div>
        <iframe
          v-else-if="previewHtml"
          :srcdoc="previewHtml"
          class="w-full h-full border-0"
          sandbox="allow-same-origin allow-popups"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Loader } from 'lucide-vue-next';
import SearchArticleForm from '~/components/global/SearchArticleForm.vue';

const toast = useToast();

const isOpen = ref(false);
const searchFormRef = ref<InstanceType<typeof SearchArticleForm> | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);

const articleQuery = ref('');
const articleList = ref<any[]>([]);
const loading = ref(false);
const noMoreData = ref(false);
const hasSearched = ref(false);
const totalArticles = ref(0);

/**
 * 滚动到底部时自动加载更多
 */
function onScroll() {
  const el = scrollContainerRef.value;
  if (!el || loading.value || noMoreData.value || articleList.value.length === 0) return;
  // 距离底部小于 100px 时触发加载
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    loadData();
  }
}

/**
 * 搜索文章
 */
async function searchArticle() {
  const keyword = articleQuery.value.trim();
  if (!keyword) return;

  articleList.value = [];
  noMoreData.value = false;
  hasSearched.value = true;
  loading.value = true;

  try {
    const response = await fetch('/api/web/mp/search-all-articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ keyword, begin: 0, count: 20 }),
    });

    if (!response.ok) {
      throw new Error('搜索失败');
    }

    const result = await response.json();

    if (result.base_resp?.ret === 0) {
      const articles = result.articles || [];
      articleList.value = articles;
      totalArticles.value = articles.length;
      // 全公众号搜索一次返回全部结果，hasMore 由后端决定
      noMoreData.value = !result.hasMore;
    } else {
      throw new Error(result.base_resp?.err_msg || '搜索失败');
    }
  } catch (e: any) {
    console.error('搜索失败:', e);
    toast.add({
      color: 'rose',
      title: '错误',
      description: e.message || '搜索失败',
      icon: 'i-octicon:bell-24',
    });
  } finally {
    loading.value = false;
  }
}

/**
 * 加载更多文章数据（仅指定 fakeid 时有效）
 */
async function loadData() {
  loading.value = true;

  try {
    const response = await fetch('/api/web/mp/search-all-articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        keyword: articleQuery.value,
        begin: articleList.value.length,
        count: 20,
      }),
    });

    if (!response.ok) {
      throw new Error('搜索失败');
    }

    const result = await response.json();

    if (result.base_resp?.ret === 0) {
      const newArticles = result.articles || [];
      // 去重
      const existingIds = new Set(articleList.value.map(a => a.aid || a.link));
      const uniqueNew = newArticles.filter((a: any) => !existingIds.has(a.aid || a.link));
      articleList.value.push(...uniqueNew);
      totalArticles.value = articleList.value.length;
      noMoreData.value = !result.hasMore;
    } else {
      throw new Error(result.base_resp?.err_msg || '搜索失败');
    }
  } catch (e: any) {
    console.error('搜索失败:', e);
    toast.add({
      color: 'rose',
      title: '错误',
      description: e.message || '搜索失败',
      icon: 'i-octicon:bell-24',
    });
  } finally {
    loading.value = false;
  }
}

/**
 * 选择文章并添加到列表
 */
const emit = defineEmits(['select:article']);

// 预览状态：实时 fetch 文章正文，用 srcdoc 渲染（绕过微信 CSP frame-ancestors）
const isPreviewOpen = ref(false);
const previewUrl = ref('');
const previewTitle = ref('');
const previewHtml = ref('');
const previewLoading = ref(false);
const previewError = ref('');

function selectArticle(article: any) {
  emit('select:article', article);
  // 不关闭抽屉，允许继续添加其他文章
}

/**
 * 预览文章：调后端接口实时抓取文章正文 HTML，用 iframe srcdoc 渲染。
 * srcdoc 不受微信 CSP frame-ancestors 限制（iframe 内容与宿主同源）。
 */
async function previewArticle(article: any) {
  if (!article.link) return;
  previewUrl.value = article.link;
  previewTitle.value = article.title || '文章预览';
  previewLoading.value = true;
  previewError.value = '';
  previewHtml.value = '';
  isPreviewOpen.value = true;

  try {
    const res = await $fetch<{ success: boolean; data: { html: string; error?: string } }>(
      '/api/web/data/v1/topic/preview-html',
      { params: { url: article.link }, credentials: 'include' }
    );
    if (res.success && res.data?.html) {
      previewHtml.value = res.data.html;
    } else {
      previewError.value = res.data?.error || '未能获取文章内容';
    }
  } catch (e: any) {
    previewError.value = e?.data?.message || e?.message || '预览请求失败';
  } finally {
    previewLoading.value = false;
  }
}

/**
 * 打开搜索抽屉
 */
function open() {
  isOpen.value = true;
  searchFormRef.value?.reset();
  articleQuery.value = '';
  articleList.value = [];
  totalArticles.value = 0;
  noMoreData.value = false;
  hasSearched.value = false;
}

defineExpose({
  open,
});
</script>
