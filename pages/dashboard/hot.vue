<script setup lang="ts">
import { Flame, TrendingUp } from 'lucide-vue-next';
import { formatTimeStamp } from '#shared/utils/helpers';
import { websiteName } from '~/config';
import { useAccountApi, type Account } from '~/composables/useAccountApi';
import { api } from '~/utils/api-client';
import toastFactory from '~/composables/toast';

useHead({
  title: `选题雷达 | ${websiteName}`,
});

const toast = toastFactory();
const accountApi = useAccountApi();

// ========== 筛选状态 ==========
const selectedDays = ref<number>(90);
const dayOptions = [
  { label: '最近7天', value: 7 },
  { label: '最近30天', value: 30 },
  { label: '最近90天', value: 90 },
  { label: '最近一年', value: 365 },
  { label: '全部', value: 0 },
];

const allAccounts = ref<Account[]>([]);
const selectedFakeids = ref<string[]>([]);
const searchKeyword = ref('');

// ========== 数据状态 ==========
interface RankingItem {
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover: string | null;
  author: string | null;
  create_time: number | null;
  digest: string | null;
  album_id: string | null;
  datetime: string | null;
  account_nickname: string | null;
  is_in_album: boolean;
}

interface TrendItem {
  keyword: string;
  count: number;
}

const rowData = ref<RankingItem[]>([]);
const totalArticles = ref(0);
const currentPage = ref(1);
const pageSize = ref(50);
const totalPages = ref(0);
const inputPage = ref(1);
const loading = ref(false);

const trends = ref<TrendItem[]>([]);
const trendsTotalArticles = ref(0);
const trendsLoading = ref(false);

// 选中的趋势词，点击后填入搜索框
function applyTrendKeyword(keyword: string) {
  searchKeyword.value = keyword;
  currentPage.value = 1;
  loadRanking();
}

// ========== 数据加载 ==========
async function loadRanking() {
  loading.value = true;
  try {
    const query: Record<string, any> = {
      days: selectedDays.value,
      page: currentPage.value,
      pageSize: pageSize.value,
    };
    if (selectedFakeids.value.length > 0) {
      query.fakeids = selectedFakeids.value.join(',');
    }
    if (searchKeyword.value.trim()) {
      query.search = searchKeyword.value.trim();
    }
    const result = await api.get<{ items: RankingItem[]; pagination: any }>(
      '/metrics/ranking',
      query,
    );
    rowData.value = result.items;
    totalArticles.value = result.pagination.total;
    totalPages.value = result.pagination.totalPages;
    inputPage.value = currentPage.value;
  } catch (e: any) {
    console.error('加载失败:', e);
    toast.error('加载失败', e?.message || '加载选题列表失败');
  } finally {
    loading.value = false;
  }
}

async function loadTrends() {
  trendsLoading.value = true;
  try {
    const query: Record<string, any> = {
      days: selectedDays.value,
      limit: 30,
    };
    if (selectedFakeids.value.length > 0) {
      query.fakeids = selectedFakeids.value.join(',');
    }
    const result = await api.get<{
      trends: TrendItem[];
      totalArticles: number;
    }>('/metrics/trends', query);
    trends.value = result.trends;
    trendsTotalArticles.value = result.totalArticles;
  } catch (e: any) {
    console.error('加载趋势失败:', e);
  } finally {
    trendsLoading.value = false;
  }
}

async function loadAccounts() {
  try {
    const result = await accountApi.getAccounts({ pageSize: 1000 });
    allAccounts.value = result.items;
  } catch (e) {
    // 静默失败
  }
}

// ========== 分页 ==========
function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  currentPage.value = page;
  inputPage.value = page;
  loadRanking();
}

function handlePageInput() {
  const page = Math.max(1, Math.min(totalPages.value, Number(inputPage.value) || 1));
  inputPage.value = page;
  goToPage(page);
}

// ========== 筛选变更 ==========
watch([selectedDays, selectedFakeids], () => {
  currentPage.value = 1;
  loadRanking();
  loadTrends();
});

// 搜索框防抖
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchKeyword, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage.value = 1;
    loadRanking();
  }, 400);
});

// ========== 初始化 ==========
onMounted(async () => {
  await Promise.all([loadAccounts(), loadRanking(), loadTrends()]);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Flame :size="20" class="text-orange-500" />
        <h1 class="text-lg font-semibold">选题雷达</h1>
      </div>

      <div class="flex-1" />

      <!-- 搜索框 -->
      <ElInput
        v-model="searchKeyword"
        placeholder="搜索标题或摘要..."
        class="w-48"
      >
        <template #prefix>
          <UIcon name="i-lucide:search" />
        </template>
      </ElInput>

      <!-- 时间范围 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500">时间</span>
        <ElSelect
          v-model="selectedDays"
          class="w-28"
        >
          <ElOption
            v-for="item in dayOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </div>

      <!-- 公众号筛选 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500">公众号</span>
        <ElSelect
          v-model="selectedFakeids"
          multiple
          filterable
          placeholder="全部"
          class="w-48"
        >
          <ElOption
            v-for="account in allAccounts"
            :key="account.fakeid"
            :label="account.nickname"
            :value="account.fakeid"
          />
        </ElSelect>
      </div>
    </div>

    <!-- 关键词趋势 -->
    <div class="border-b border-gray-200 dark:border-gray-800 px-3 py-2">
      <div class="flex items-center gap-2 mb-2">
        <TrendingUp :size="14" class="text-orange-500" />
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
          热门话题（最近 {{ selectedDays }} 天，共 {{ trendsTotalArticles }} 篇文章）
        </span>
      </div>
      <div v-if="trendsLoading" class="text-xs text-gray-400 py-2">加载中...</div>
      <div v-else-if="trends.length === 0" class="text-xs text-gray-400 py-2">
        暂无足够数据，请先在公众号管理中同步文章
      </div>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
          v-for="trend in trends"
          :key="trend.keyword"
          type="button"
          @click="applyTrendKeyword(trend.keyword)"
          class="text-xs px-2 py-1 rounded-full transition-colors cursor-pointer"
          :class="searchKeyword === trend.keyword
            ? 'bg-orange-500 text-white'
            : 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300'"
        >
          {{ trend.keyword }}
          <span class="opacity-60">{{ trend.count }}</span>
        </button>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="flex items-center gap-4 px-3 py-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
      <span>共 {{ totalArticles }} 篇</span>
      <span v-if="searchKeyword" class="text-orange-500">筛选：{{ searchKeyword }}</span>
      <span class="text-gray-400">按发布时间倒序</span>
    </div>

    <!-- 表格 + 底部分页 -->
    <div class="flex-1 overflow-hidden flex flex-col">
      <div class="flex-1 overflow-auto">
        <ElTable
          :data="rowData"
          v-loading="loading"
          stripe
          border
          style="width: 100%"
          :default-sort="{ prop: 'create_time', order: 'descending' }"
        >
          <el-table-column label="标题" min-width="300">
            <template #default="{ row }">
              <a
                :href="row.link"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sky-600 hover:text-sky-800 hover:underline line-clamp-2"
                >{{ row.title }}</a
              >
            </template>
          </el-table-column>
          <el-table-column label="公众号" width="140">
            <template #default="{ row }">{{ row.account_nickname || '--' }}</template>
          </el-table-column>
          <el-table-column label="摘要" min-width="200">
            <template #default="{ row }">
              <span class="text-gray-500 text-xs">{{
                (row.digest || '').substring(0, 60) + (row.digest?.length > 60 ? '...' : '')
              }}</span>
            </template>
          </el-table-column>
          <el-table-column label="合集" width="90">
            <template #default="{ row }">
              <ElTag v-if="row.is_in_album" type="primary" size="small">合集</ElTag>
              <span v-else class="text-gray-300">--</span>
            </template>
          </el-table-column>
          <el-table-column
            label="发布时间"
            width="180"
            prop="create_time"
            sortable
          >
            <template #default="{ row }">
              <span class="font-mono">{{ formatTimeStamp(row.create_time) }}</span>
            </template>
          </el-table-column>
        </ElTable>
      </div>

      <!-- 分页（参考 article.vue 风格，放在表格底部） -->
      <div
        v-if="totalArticles > 0"
        class="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div class="text-sm text-gray-600 dark:text-gray-400">
          共 {{ totalArticles }} 条，第 {{ currentPage }} / {{ totalPages }} 页
        </div>
        <div class="flex items-center gap-2">
          <ElButton
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
            ><template #icon><UIcon name="i-heroicons-chevron-left" /></template></ElButton
          >
          <ElInput
            v-model.number="inputPage"
            type="number"
            :min="1"
            :max="totalPages"
            class="w-16 text-center"
            @keyup.enter="handlePageInput"
            @blur="handlePageInput"
          />
          <span class="text-sm text-gray-600 dark:text-gray-400">/ {{ totalPages }}</span>
          <ElButton
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
            ><template #icon><UIcon name="i-heroicons-chevron-right" /></template></ElButton
          >
          <select
            v-model.number="pageSize"
            class="text-sm border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-transparent ml-2"
            @change="currentPage = 1; loadRanking()"
          >
            <option :value="50">50条/页</option>
            <option :value="100">100条/页</option>
            <option :value="200">200条/页</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>
