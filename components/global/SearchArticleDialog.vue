<template>
  <USlideover v-model="isOpen" side="left" :ui="{ overlay: { background: 'bg-zinc-400/75' } }">
    <div
      class="w-96 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 shadow bg-white dark:bg-gray-900 flex flex-col flex-1 overflow-y-scroll"
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
        <p v-else-if="noMoreData" class="text-center mt-2 py-2 text-slate-400">
          已全部加载完毕
        </p>
        <button
          v-else-if="articleList.length > 0 && !loading && !noMoreData"
          @click="loadData"
          class="block mx-auto my-2 h-10 px-6 font-semibold rounded-md border border-slate-200 text-slate-900 dark:text-slate-300 hover:border-slate-400"
          type="button"
        >
          加载更多
        </button>
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

const articleQuery = ref('');
const articleList = ref<any[]>([]);
const loading = ref(false);
const noMoreData = ref(false);
const hasSearched = ref(false);
const totalArticles = ref(0);

let currentPage = 0;
const pageSize = 20;

/**
 * 搜索文章
 */
async function searchArticle() {
  const keyword = articleQuery.value.trim();
  if (!keyword) return;

  currentPage = 0;
  articleList.value = [];
  noMoreData.value = false;
  hasSearched.value = true;
  loading.value = true;

  try {
    const response = await fetch('/api/web/mp/search-all-articles', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword: keyword,
        begin: 0,
        count: pageSize * 2, // 首次加载更多
      }),
    });

    if (!response.ok) {
      throw new Error('搜索失败');
    }

    const result = await response.json();

    if (result.base_resp?.ret === 0) {
      articleList.value = result.articles || [];
      totalArticles.value = result.total || 0;
      currentPage = 0;
      noMoreData.value = !result.hasMore || articleList.value.length >= result.total;
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
 * 加载更多文章数据
 */
async function loadData() {
  loading.value = true;
  currentPage += 1;

  try {
    const response = await fetch('/api/web/mp/search-all-articles', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword: articleQuery.value,
        begin: currentPage * pageSize,
        count: pageSize,
      }),
    });

    if (!response.ok) {
      throw new Error('搜索失败');
    }

    const result = await response.json();

    if (result.base_resp?.ret === 0) {
      const newArticles = result.articles || [];
      articleList.value.push(...newArticles);
      noMoreData.value = !result.hasMore || articleList.value.length >= result.total;
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
  currentPage = 0;
}

defineExpose({
  open,
});
</script>
