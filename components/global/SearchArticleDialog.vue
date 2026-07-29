<template>
  <!--
    搜索抽屉：左右分栏二级选择布局。
    - 左栏：搜索框 + 文章列表（可滚动），点击列表项可选中并入库。
    - 右栏：文章预览正文，点击列表项的「预览」按钮即时展示。
    整体宽度 960px，在抽屉内通过 flex 实现稳定的左右分栏。
  -->
  <ElDrawer v-model="isOpen" direction="ltr" size="960px" class="search-article-drawer">
    <template #header>
      <h3 class="text-lg font-semibold">搜索文章</h3>
    </template>

    <div class="flex h-full">
      <!-- ===== 左栏：搜索 + 列表 ===== -->
      <section class="flex w-[360px] flex-shrink-0 flex-col">
        <!-- 搜索区（吸顶） -->
        <div class="z-10 flex-shrink-0 bg-white px-2 py-3 shadow-sm dark:bg-gray-900">
          <SearchArticleForm ref="searchFormRef" v-model="articleQuery" @search="searchArticle" />
          <p v-if="!loading && articleList.length > 0" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            找到 {{ totalArticles }} 篇相关文章
          </p>
        </div>

        <!-- 列表区（仅列表滚动，不影响右栏） -->
        <div
          ref="scrollContainerRef"
          class="no-scrollbar flex-1 overflow-y-auto"
          @scroll="onScroll"
        >
          <ul class="divide-y antialiased">
            <li
              v-for="article in articleList"
              :key="article.aid"
              class="group flex cursor-pointer flex-col gap-2 px-2 py-4 hover:bg-slate-50"
              :class="isPreviewing(article) ? 'bg-blue-50 hover:bg-blue-50' : ''"
              @click="selectArticle(article)"
            >
              <div class="flex items-start justify-between">
                <p class="line-clamp-2 flex-1 font-medium" v-text="article.title"></p>
                <p v-if="article.create_time_formatted" class="ml-2 whitespace-nowrap text-xs text-sky-500" v-text="article.create_time_formatted"></p>
              </div>
              <div class="flex items-center justify-between">
                <p class="text-xs text-gray-500">
                  {{ article.account_nickname || '未知公众号' }}
                </p>
                <!-- 预览按钮：阻止冒泡，避免触发 selectArticle -->
                <ElButton
                  size="small"
                  text
                  class="opacity-0 group-hover:opacity-100"
                  :class="isPreviewing(article) ? '!opacity-100' : ''"
                  title="预览文章内容"
                  @click.stop="previewArticle(article)"
                ><template #icon><UIcon name="i-lucide:eye" /></template></ElButton>
              </div>
              <p v-if="article.digest" class="line-clamp-2 text-xs text-gray-400">{{ article.digest }}</p>
            </li>
          </ul>

          <p v-if="loading" class="my-2 flex items-center justify-center py-2">
            <Loader :size="28" class="animate-spin text-slate-500" />
          </p>
          <p v-else-if="articleList.length === 0 && hasSearched" class="mt-2 py-2 text-center text-slate-400">
            未找到相关文章，请尝试其他关键词
          </p>
          <p v-else-if="noMoreData && articleList.length > 0" class="mt-2 py-2 text-center text-slate-400">
            已全部加载完毕
          </p>
        </div>
      </section>

      <!-- ===== 右栏：文章预览正文 ===== -->
      <ArticlePreviewPanel
        :title="previewTitle"
        :url="previewUrl"
        :html="previewHtml"
        :loading="previewLoading"
        :error="previewError"
        @close="closePreview"
      />
    </div>
  </ElDrawer>
</template>

<script setup lang="ts">
import { Loader } from 'lucide-vue-next';
import ArticlePreviewPanel from '~/components/global/ArticlePreviewPanel.vue';
import SearchArticleForm from '~/components/global/SearchArticleForm.vue';
import toastFactory from '~/composables/toast';

const toast = toastFactory();

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
    toast.error('错误', e.message || '搜索失败');
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
    toast.error('错误', e.message || '搜索失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 选择文章并添加到列表
 */
const emit = defineEmits(['select:article']);

// 预览状态：实时 fetch 文章正文，用 srcdoc 渲染（绕过微信 CSP frame-ancestors）
// 以 previewUrl 是否为空作为「是否在预览」的判定，无需额外的 isPreviewOpen
const previewUrl = ref('');
const previewTitle = ref('');
const previewHtml = ref('');
const previewLoading = ref(false);
const previewError = ref('');

function selectArticle(article: any) {
  emit('select:article', article);
  // 不关闭抽屉，允许继续添加其他文章
}

/** 判断某篇文章是否正处于预览中（用于列表项高亮） */
function isPreviewing(article: any): boolean {
  return !!previewUrl.value && previewUrl.value === article.link;
}

/** 关闭预览：清空预览状态，回到空状态引导 */
function closePreview() {
  previewUrl.value = '';
  previewTitle.value = '';
  previewHtml.value = '';
  previewError.value = '';
  previewLoading.value = false;
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

  try {
    const res = await $fetch<{ success: boolean; data: { html: string; error?: string } }>(
      '/api/web/data/v1/topic/preview-html',
      { params: { url: article.link }, credentials: 'include' }
    );
    // 用户可能在请求期间切换到其他文章，这里校验避免旧请求覆盖新预览
    if (previewUrl.value !== article.link) return;
    if (res.success && res.data?.html) {
      previewHtml.value = res.data.html;
    } else {
      previewError.value = res.data?.error || '未能获取文章内容';
    }
  } catch (e: any) {
    if (previewUrl.value !== article.link) return;
    previewError.value = e?.data?.message || e?.message || '预览请求失败';
  } finally {
    if (previewUrl.value === article.link) {
      previewLoading.value = false;
    }
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
  closePreview();
}

defineExpose({
  open,
});
</script>

<style>
/*
  抽屉内容区顶部内边距清零，把屏幕空间留给左右分栏内容。
  ElDrawer 默认渲染到 body，scoped 无法穿透到弹层，故用非 scoped 全局样式，
  但通过自定义 .search-article-drawer class 限定作用域，避免影响其他抽屉。
*/
.search-article-drawer .el-drawer__body {
  padding-top: 0;
}
</style>
