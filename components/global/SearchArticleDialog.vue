<template>
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
            class="flex flex-col gap-2 px-2 py-4 hover:bg-slate-50 hover:cursor-pointer"
            @click="selectArticle(article)"
          >
            <div class="flex justify-between">
              <p class="font-medium line-clamp-2 flex-1" v-text="article.title"></p>
              <p class="text-sky-500 text-xs ml-2" v-text="article.create_time_formatted"></p>
            </div>
            <p class="text-gray-500 text-xs">
              {{ article.account_nickname || '未知公众号' }}
            </p>
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

function selectArticle(article: any) {
  emit('select:article', article);
  // 不关闭抽屉，允许继续添加其他文章
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
