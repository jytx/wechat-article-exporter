<script setup lang="ts">
import type { Ref } from 'vue';
import type { PreviewArticle } from '#components';
import { durationToSeconds, formatItemShowType, formatTimeStamp, sleep } from '#shared/utils/helpers';
import { validateHTMLContent } from '#shared/utils/html';
import SearchArticleDialog from '~/components/global/SearchArticleDialog.vue';
import GridAlbum from '~/components/grid/Album.vue';
import GridArticleActions from '~/components/grid/ArticleActions.vue';
import AccountSelectorForArticle from '~/components/selector/AccountSelectorForArticle.vue';
import toastFactory from '~/composables/toast';
// 新增：使用文章 API
import { useArticleApiWithState, useArticleFilter } from '~/composables/useArticleApi';
import { isDev, websiteName } from '~/config';
// 保留：文章内容和留言的本地缓存（这些是下载的内容，不是查询的数据）
import { getCommentCache } from '~/store/v2/comment';
import { getDebugCache } from '~/store/v2/debug';
import { getHtmlCache } from '~/store/v2/html';
import { getMetadataCache, type Metadata } from '~/store/v2/metadata';
import type { Article as ApiArticle } from '~/types/api';
import type { Preferences } from '~/types/preferences';
import type { AppMsgExWithFakeID } from '~/types/types';
import type { ArticleMetadata } from '~/utils/download/types';
import { exportArticlesToServer } from '~/utils/server-article-export';
import { isArticleHtmlDownloadedOnServer } from '~/utils/server-html';

useHead({
  title: `文章下载 | ${websiteName}`,
});

// 当前页面的数据模型
interface Article extends AppMsgExWithFakeID, Partial<ArticleMetadata> {
  /**
   * 文章内容是否已下载
   */
  contentDownload: boolean;

  /**
   * 留言内容是否已下载
   */
  commentDownload: boolean;
}

// 新增：使用文章 API
const articleApi = useArticleApiWithState();
const {
  fakeid,
  status,
  getParams,
  resetFilter,
  switchAccount,
  switchStatus,
  setPage,
  page,
  pageSize,
  search,
  setSearch,
} = useArticleFilter();

// 分页数据
const pagination = ref({
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
});

// 当前页码（本地状态，用于 v-model）
const currentPage = ref(1);
// 输入框页码（用于分页输入框）
const inputPage = ref(currentPage.value);

// 搜索关键词
const searchKeyword = ref('');

// 处理搜索
function handleSearch() {
  setSearch(searchKeyword.value);
  currentPage.value = 1;
  refresh();
}

// 清除搜索
function clearSearch() {
  searchKeyword.value = '';
  setSearch('');
  currentPage.value = 1;
  refresh();
}

const tableRef = ref();
const globalRowData = ref<Article[]>([]);
const selectedRows = ref<Article[]>([]);

function onSelectionChange(val: Article[]) {
  selectedRows.value = val;
}

function onFilterChange() {
  // 过滤变化时清空选择，避免对隐藏行执行批量操作
  tableRef.value?.clearSelection();
}

// row-key：沿用 AG Grid 的 `${fakeid}:${aid}` 格式
function getRowKey(row: Article) {
  return `${row.fakeid}:${row.aid}`;
}

const preferences = usePreferences();
const hideDeleted = computed(() => (preferences.value as unknown as Preferences).hideDeleted);

const previewArticleRef = ref<typeof PreviewArticle | null>(null);

function preview(article: Article) {
  previewArticleRef.value!.open(article);
}

function onGotoLink(row: Article) {
  if (row.link) {
    window.open(row.link, '_blank', 'noopener');
  }
}

// 保留原有的 loading 状态（用于表格加载动画）
const tableLoading = ref(false);

// 只能选择单个账号
const selectedAccount = ref<{ fakeid: string; nickname: string; synced_count?: number } | undefined>();

// 修改：使用 API 加载数据
watch(
  selectedAccount,
  newVal => {
    if (newVal) {
      switchAccount(newVal.fakeid);
      currentPage.value = 1; // 重置页码
      refresh();
    }
  },
  { immediate: true }
);

// 监听页码变化
watch(currentPage, newPage => {
  setPage(newPage);
  refresh();
});

// 监控分页数据变化
watch(
  pagination,
  newPagination => {
    console.log('[article.vue] pagination 变化:', JSON.stringify(newPagination, null, 2));
    console.log('[article.vue] 计算的页数:', newPagination.total / newPagination.pageSize);
  },
  { deep: true }
);

// 同步 inputPage 和 currentPage
watch(currentPage, newPage => {
  inputPage.value = newPage;
});

// 修改：使用新的 API 加载文章数据
async function refresh() {
  // 移除 fakeid 检查，允许显示所有文章
  // if (!fakeid.value) return;

  tableLoading.value = true;
  try {
    const params = getParams();
    const result = await articleApi.fetchArticles(params);

    // console.log('[article.vue] 后端返回的分页数据:', JSON.stringify(result.pagination, null, 2));

    // 保存分页信息
    pagination.value = result.pagination;
    currentPage.value = result.pagination.page;

    console.log('[article.vue] 更新后的 pagination.value:', JSON.stringify(pagination.value, null, 2));

    // 合并 API 数据和本地缓存数据（下载状态、元数据等）
    const articles: Article[] = [];
    for (const article of result.items) {
      const contentDownload = await isArticleHtmlDownloadedOnServer(article.link);
      const commentDownload = (await getCommentCache(article.link)) !== undefined;
      const metadata = await getMetadataCache(article.link);

      if (metadata) {
        articles.push({
          ...metadata,
          ...article,
          contentDownload: contentDownload,
          commentDownload: commentDownload,
        });
      } else {
        articles.push({
          ...article,
          contentDownload: contentDownload,
          commentDownload: commentDownload,
        });
      }
    }

    await sleep(200);
    globalRowData.value = articles.filter(article => (hideDeleted.value ? !article.is_deleted : true));
  } catch (error: any) {
    console.error('加载文章列表失败:', error);
  } finally {
    tableLoading.value = false;
  }
}

function updateRow(article: Article) {
  const idx = globalRowData.value.findIndex(r => r.fakeid === article.fakeid && r.aid === article.aid);
  if (idx >= 0) {
    globalRowData.value[idx] = { ...article };
  }
}

// ===== 全网文章搜索（从 single 页面搬来）=====
const searchArticleDialogRef = ref<InstanceType<typeof SearchArticleDialog> | null>(null);

function openSearchDialog() {
  searchArticleDialogRef.value?.open();
}

/**
 * 从微信文章 URL 解析出 biz(fakeid)、mid、idx、sn。
 * URL 格式：https://mp.weixin.qq.com/s?__biz=xxx&mid=xxx&idx=xxx&sn=xxx
 * 或短链 https://mp.weixin.qq.com/s/xxxxx（短链无法解析，返回 null）
 */
function parseWechatUrl(url: string): { fakeid: string; mid: string; idx: string; sn: string } | null {
  try {
    const u = new URL(url);
    const biz = u.searchParams.get('__biz');
    const mid = u.searchParams.get('mid');
    const idx = u.searchParams.get('idx') || '1';
    const sn = u.searchParams.get('sn') || '';
    if (!biz || !mid) return null;
    return { fakeid: biz, mid, idx, sn };
  } catch {
    return null;
  }
}

/**
 * 从搜索结果选中文章：入库（文章+公众号）+ 同步插入列表 + 自动抓取正文。
 * 关键：必须同时存公众号到 accounts 表，否则 articles.get 遍历 accounts 时查不到这篇文章。
 */
async function selectArticleFromSearch(article: any) {
  try {
    const link = article.link;
    if (!link) {
      toast.warning('提示', '该文章没有有效链接');
      return;
    }

    // 从 URL 解析出真实的 biz/mid/idx，构造和微信一致的数据结构
    const parsed = parseWechatUrl(link);
    let fakeid: string;
    let aid: string;
    let key: string;

    if (parsed) {
      fakeid = parsed.fakeid;
      aid = `${parsed.mid}_${parsed.idx}`;
      key = `${parsed.fakeid}:${parsed.mid}_${parsed.idx}`;
    } else {
      toast.warning('提示', '该文章链接格式非标准（可能是短链），尝试用 URL 兜底入库');
      fakeid = 'unknown';
      aid = link;
      key = `url:${link}`;
    }

    // 防重复
    if (globalRowData.value.some(r => r.key === key || r.link === link)) {
      toast.info('提示', '该文章已在列表中');
      return;
    }

    const newRow: Article = {
      key,
      fakeid,
      aid,
      title: article.title || '未命名文章',
      link,
      cover: article.cover || '',
      digest: article.digest || '',
      author: article.author || article.account_nickname || '',
      create_time: article.create_time && article.create_time > 0 ? article.create_time : null,
      update_time: article.create_time && article.create_time > 0 ? article.create_time : null,
      datetime: article.create_time_formatted || '',
      downloaded: false,
      is_deleted: false,
      album_id: '',
      appmsg_album_infos: [],
    } as unknown as Article;

    // 1. 入库（文章 + 公众号一起存，用专用接口确保公众号存在）
    try {
      await $fetch('/api/web/data/v1/batch/save-searched-article', {
        method: 'POST',
        body: {
          article: {
            key: newRow.key,
            fakeid: newRow.fakeid,
            aid: newRow.aid,
            title: newRow.title,
            link: newRow.link,
            cover: newRow.cover || '',
            author: newRow.author || '',
            digest: newRow.digest || '',
            create_time: newRow.create_time || null,
            datetime: newRow.datetime || '',
          },
          account: {
            fakeid: newRow.fakeid,
            nickname: article.account_nickname || article.author || '未知公众号',
            round_head_img: article.head_img_url || '',
            signature: article.profile_description || '',
          },
        },
        credentials: 'include',
      });
    } catch (e: any) {
      console.error('搜索文章入库失败（不影响列表显示）:', e?.data?.message || e?.message);
    }

    // 2. 切到"全部"视图，清空筛选
    selectedAccount.value = undefined;
    searchKeyword.value = '';

    // 3. 同步插入到列表头部 + 刷新表格
    globalRowData.value = [newRow, ...globalRowData.value];

    toast.success('已添加', `"${newRow.title}" 已添加到列表，正在抓取正文...`);

    // 4. 自动抓取该文章正文
    download('html', [link]);
  } catch (e: any) {
    console.error('从搜索添加文章失败:', e);
    toast.error('添加失败', e?.data?.message || e?.message || '添加失败');
  }
}

// 处理页码输入
function handlePageInput() {
  const page = Math.max(1, Math.min(pagination.value.totalPages, Number(inputPage.value) || 1));
  if (page !== currentPage.value) {
    setPage(page);
    currentPage.value = page;
    refresh();
  }
  // 重置输入框为当前页码
  inputPage.value = currentPage.value;
}

const selectedArticles = computed(() => selectedRows.value);
const selectedArticleUrls = computed(() => {
  return selectedArticles.value.map(article => article.link);
});
const contentNotDownloadedCount = computed(() => {
  return selectedArticles.value.filter(article => !article.contentDownload).length;
});

const {
  loading: downloadBtnLoading,
  completed_count: downloadCompletedCount,
  total_count: downloadTotalCount,
  download,
  stop: stopDownload,
} = useDownloader({
  onContent(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.contentDownload = true;
      article._status = '正常';
      updateRow(article);

      // 使用 API 更新状态
      const key = `${article.fakeid}:${article.aid}`;
      articleApi.markDownloaded(key).catch(err => {
        console.error('更新文章状态失败:', err);
      });

      // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
      article.is_deleted = false;
      articleApi.markDeleted(key, false).catch(err => {
        console.error('更新删除状态失败:', err);
      });
    } else {
      console.warn(`${url} not found in table data when update contentDownload`);
    }
  },
  onStatusChange(url: string, status: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article._status = status;
      updateRow(article);
      // 状态变更暂时不调用 API，因为 _status 是前端扩展字段
    }
  },
  onDelete(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      article._status = '已删除';
      updateRow(article);

      // 使用 API 更新删除状态
      const key = `${article.fakeid}:${article.aid}`;
      articleApi.markDeleted(key, true).catch(err => {
        console.error('标记删除失败:', err);
      });
    }
  },
  onMetadata(url: string, metadata: Metadata) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.readNum = metadata.readNum;
      article.oldLikeNum = metadata.oldLikeNum;
      article.shareNum = metadata.shareNum;
      article.likeNum = metadata.likeNum;
      article.commentNum = metadata.commentNum;

      if ((preferences.value as unknown as Preferences).downloadConfig.metadataOverrideContent) {
        // 如果同步下载文章内容，则更新相关字段
        article.contentDownload = true;
        article._status = '正常';

        // 使用 API 更新状态
        const key = `${article.fakeid}:${article.aid}`;
        articleApi.markDownloaded(key).catch(err => {
          console.error('更新文章状态失败:', err);
        });

        // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
        article.is_deleted = false;
        articleApi.markDeleted(key, false).catch(err => {
          console.error('更新删除状态失败:', err);
        });
      }

      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update metadata`);
    }
  },
  onComment(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.commentDownload = true;
      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update commentDownload`);
    }
  },
});

// 抓取类型选项
const downloadTypes = [
  { label: '文章内容', value: 'html' },
  { label: '阅读量', value: 'metadata' },
  { label: '留言', value: 'comment' },
  { label: '修复 FakeID', value: 'fakeid' },
] as const;

// 当前选择的抓取类型
const selectedDownloadType = ref<(typeof downloadTypes)[number]['value']>('html');

// 执行抓取
async function executeDownload() {
  await download(selectedDownloadType.value, selectedArticleUrls.value);
}

const {
  loading: exportBtnLoading,
  phase: exportPhase,
  completed_count: exportCompletedCount,
  total_count: exportTotalCount,
  exportFile,
} = useExporter();

// 导出格式选项
const exportFormats = [
  { label: 'Excel', value: 'excel' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'html' },
  { label: 'Txt', value: 'text' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Word (内测中)', value: 'word' },
] as const;

// 当前选择的导出格式
const selectedExportFormat = ref<(typeof exportFormats)[number]['value']>('markdown');

// 执行导出
async function executeExport() {
  const toast = toastFactory();
  const preferences = usePreferences();
  const exportPath = preferences.value.exportConfig.exportPath;

  // 检查是否设置了导出路径
  if (!exportPath || exportPath === '') {
    toast.warning('提示', '请先在"其他设置"中设置导出路径');
    return;
  }

  const format = selectedExportFormat.value;
  const urls = selectedArticleUrls.value;

  if (urls.length === 0) {
    toast.warning('提示', '请先选择文章');
    return;
  }

  // 检查内容是否已下载（仅对需要内容的格式）
  if (['html', 'text', 'markdown', 'word'].includes(format) && contentNotDownloadedCount.value > 0) {
    toast.warning('提示', `有 ${contentNotDownloadedCount.value} 篇文章尚未抓取内容，请先抓取内容后再导出`);
    return;
  }

  try {
    exportBtnLoading.value = true;
    exportPhase.value = '准备中';
    exportCompletedCount.value = 0;
    exportTotalCount.value = urls.length;

    // 收集文章信息
    const articles = selectedArticles.value.map(article => ({
      url: article.link,
      title: article.title,
      fakeid: article.fakeid,
      accountName: article.account_nickname || '未知公众号',
    }));

    // 导出格式映射
    const formatMap: Record<string, 'markdown' | 'html' | 'txt'> = {
      markdown: 'markdown',
      html: 'html',
      text: 'txt',
      word: 'markdown', // Word 暂时用 markdown 替代
    };

    const exportFormat = formatMap[format] || 'markdown';

    // 调用服务端导出
    const result = await exportArticlesToServer(articles, exportFormat, exportPath, (current, total) => {
      exportCompletedCount.value = current;
      exportTotalCount.value = total;
      exportPhase.value = `导出中 ${current}/${total}`;
    });

    if (result.success) {
      toast.success('导出成功', result.message);
    } else {
      toast.error('导出失败', result.message);
    }
  } catch (error) {
    console.error('导出失败:', error);
    toast.error('导出失败', error instanceof Error ? error.message : '未知错误');
  } finally {
    exportBtnLoading.value = false;
  }
}

async function debug() {
  const cache = await getDebugCache('https://mp.weixin.qq.com/s/0IEaqpJIBGykHFKqj-7xqw');
  console.log(cache);
  if (cache) {
    const html = await cache.file.text();
    console.log(html);
    const result = validateHTMLContent(html);
    console.log(result);
  }
}

const copied: Ref<boolean> = ref(false);
function copyWechatLink() {
  const link = `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${selectedAccount.value?.fakeid}&scene=124#wechat_redirect`;
  navigator.clipboard.writeText(link);

  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1000);
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">文章下载</h1>
    </Teleport>

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部筛选与操作区 -->
      <header class="flex flex-col items-start lg:flex-row lg:items-center lg:justify-between gap-2 px-3 py-2">
        <div class="flex flex-col xl:flex-row gap-2">
          <div class="flex space-x-3">
            <AccountSelectorForArticle v-model="selectedAccount" class="w-80" />
            <ElInput
              v-model="searchKeyword"
              placeholder="搜索标题或摘要..."
              class="w-80"
              @keyup.enter="handleSearch"
              @blur="handleSearch"
            >
              <template v-if="searchKeyword && searchKeyword.length > 0" #suffix>
                <span class="text-gray-400 cursor-pointer hover:text-gray-600" @click="clearSearch">
                  <UIcon name="i-heroicons-x-mark-20-solid" />
                </span>
              </template>
            </ElInput>
            <ElButton @click="openSearchDialog"><template #icon><UIcon name="i-lucide:search" /></template>全网搜索</ElButton>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <ElButton
            v-if="downloadBtnLoading"
            @click="stopDownload"
          >
            停止
          </ElButton>

          <!-- 抓取按钮组 -->
          <div class="flex items-center gap-0">
            <!-- 主抓取按钮 -->
            <ElButton
              :loading="downloadBtnLoading"
              :disabled="!selectedAccount"
              class="font-mono rounded-r-none"
              @click="executeDownload"
            >{{ downloadBtnLoading ? `抓取中 ${downloadCompletedCount}/${downloadTotalCount}` : `抓取 (${downloadTypes.find(t => t.value === selectedDownloadType)?.label})` }}</ElButton
            >
            <!-- 下拉选择按钮 -->
            <ElPopover>
              <template #reference>
                <ElButton
                  :disabled="!selectedAccount || downloadBtnLoading"
                  class="font-mono rounded-l-none border-l-0"
                  ><template #icon><UIcon name="i-heroicons-chevron-down-20-solid" /></template></ElButton
                >
              </template>
              <div class="p-1">
                <button
                  v-for="type in downloadTypes"
                  :key="type.value"
                  @click="selectedDownloadType = type.value"
                  class="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  :class="{
                    'bg-gray-100 dark:bg-gray-800': selectedDownloadType === type.value
                  }"
                >
                  {{ type.label }}
                </button>
              </div>
            </ElPopover>
          </div>

          <!-- 导出按钮组 -->
          <div class="flex items-center gap-0">
            <!-- 主导出按钮 -->
            <ElButton
              :loading="exportBtnLoading"
              :disabled="!selectedAccount"
              class="font-mono rounded-r-none"
              @click="executeExport"
            >{{ exportBtnLoading ? `${exportPhase} ${exportCompletedCount}/${exportTotalCount}` : `导出 (${exportFormats.find(f => f.value === selectedExportFormat)?.label})` }}</ElButton
            >
            <!-- 下拉选择按钮 -->
            <ElPopover>
              <template #reference>
                <ElButton
                  :disabled="!selectedAccount || exportBtnLoading"
                  class="font-mono rounded-l-none border-l-0"
                  ><template #icon><UIcon name="i-heroicons-chevron-down-20-solid" /></template></ElButton
                >
              </template>
              <div class="p-1">
                <button
                  v-for="format in exportFormats"
                  :key="format.value"
                  @click="selectedExportFormat = format.value"
                  class="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  :class="{
                    'bg-gray-100 dark:bg-gray-800': selectedExportFormat === format.value
                  }"
                >
                  {{ format.label }}
                </button>
              </div>
            </ElPopover>
          </div>

          <ElButton
            :disabled="!selectedAccount"
            type="primary"
            @click="copyWechatLink"
          >
            <template #icon>
              <UIcon v-if="copied" name="i-lucide:check" />
              <UIcon v-else name="i-heroicons-link-16-solid" />
            </template>
            复制公众号链接
          </ElButton>
          <ElButton v-if="isDev" @click="debug">调试</ElButton>
        </div>
      </header>

      <!-- 加载状态 -->
      <div v-if="articleApi.loading.value" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-600">{{ articleApi.loadingText.value }}</p>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="articleApi.error.value" class="bg-red-50 border border-red-200 rounded-md p-4 m-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 0 008 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium text-red-800">{{ articleApi.error.value }}</p>
            <button @click="articleApi.clearError()" class="mt-1 text-sm text-red-700 underline">关闭</button>
          </div>
        </div>
      </div>

      <!-- 数据表格 -->
      <div v-else class="flex-1 flex flex-col overflow-hidden">
        <ElTable
          ref="tableRef"
          v-loading="tableLoading"
          :data="globalRowData"
          stripe
          border
          height="100%"
          style="width: 100%"
          :row-key="getRowKey"
          @selection-change="onSelectionChange"
          @filter-change="onFilterChange"
        >
          <ElTableColumn type="selection" width="55" fixed="left" reserve-selection />

          <!-- 1. ID -->
          <ElTableColumn prop="aid" label="ID" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="font-mono">{{ row.aid }}</span>
            </template>
          </ElTableColumn>

          <!-- 2. 公众号 -->
          <ElTableColumn prop="account_nickname" label="公众号" min-width="120" sortable>
            <template #default="{ row }">
              {{ row.account_nickname || '--' }}
            </template>
          </ElTableColumn>

          <!-- 3. 链接 -->
          <ElTableColumn prop="link" label="链接" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="font-mono">{{ row.link }}</span>
            </template>
          </ElTableColumn>

          <!-- 4. 标题 -->
          <ElTableColumn prop="title" label="标题" min-width="200" sortable show-overflow-tooltip />

          <!-- 5. 封面 -->
          <ElTableColumn label="封面" width="80">
            <template #default="{ row }">
              <ElPopover v-if="row.cover" placement="top" trigger="hover" :width="300">
                <template #reference>
                  <img :src="row.cover" class="size-10 rounded" />
                </template>
                <img :src="row.cover" class="w-[300px]" />
              </ElPopover>
            </template>
          </ElTableColumn>

          <!-- 6. 摘要 -->
          <ElTableColumn prop="digest" label="摘要" min-width="200" show-overflow-tooltip />

          <!-- 7. 创建时间 -->
          <ElTableColumn prop="create_time" label="创建时间" min-width="180" sortable>
            <template #default="{ row }">
              {{ row.create_time ? formatTimeStamp(row.create_time) : '--' }}
            </template>
          </ElTableColumn>

          <!-- 8. 发布时间 -->
          <ElTableColumn prop="update_time" label="发布时间" min-width="180" sortable>
            <template #default="{ row }">
              {{ row.update_time ? formatTimeStamp(row.update_time) : '--' }}
            </template>
          </ElTableColumn>

          <!-- 9. 是否已删除 -->
          <ElTableColumn label="是否已删除" min-width="120" sortable
            :filters="[{ text: '已删除', value: 'true' }, { text: '未删除', value: 'false' }]"
            :filter-method="(value: string, row: Article) => String(!!row.is_deleted) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.is_deleted ? 'danger' : 'success'" size="small">
                {{ row.is_deleted ? '已删除' : '未删除' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 10. 文章状态 -->
          <ElTableColumn prop="_status" label="文章状态" min-width="120" sortable />

          <!-- 11. 内容已下载 -->
          <ElTableColumn label="内容已下载" min-width="120" sortable
            :filters="[{ text: '已下载', value: 'true' }, { text: '未下载', value: 'false' }]"
            :filter-method="(value: string, row: Article) => String(row.contentDownload) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.contentDownload ? 'success' : 'info'" size="small">
                {{ row.contentDownload ? '已下载' : '未下载' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 12. 留言已下载 -->
          <ElTableColumn label="留言已下载" min-width="120" sortable
            :filters="[{ text: '已下载', value: 'true' }, { text: '未下载', value: 'false' }]"
            :filter-method="(value: string, row: Article) => String(row.commentDownload) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.commentDownload ? 'success' : 'info'" size="small">
                {{ row.commentDownload ? '已下载' : '未下载' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 13. 阅读 -->
          <ElTableColumn prop="readNum" label="阅读" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.readNum }}</span>
            </template>
          </ElTableColumn>

          <!-- 14. 点赞 -->
          <ElTableColumn prop="oldLikeNum" label="点赞" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.oldLikeNum }}</span>
            </template>
          </ElTableColumn>

          <!-- 15. 分享 -->
          <ElTableColumn prop="shareNum" label="分享" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.shareNum }}</span>
            </template>
          </ElTableColumn>

          <!-- 16. 喜欢 -->
          <ElTableColumn prop="likeNum" label="喜欢" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.likeNum }}</span>
            </template>
          </ElTableColumn>

          <!-- 17. 留言 -->
          <ElTableColumn prop="commentNum" label="留言" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.commentNum }}</span>
            </template>
          </ElTableColumn>

          <!-- 18. 作者 -->
          <ElTableColumn prop="author_name" label="作者" min-width="120" sortable />

          <!-- 19. 是否原创 -->
          <ElTableColumn label="是否原创" min-width="100" sortable
            :filters="[{ text: '原创', value: 'true' }, { text: '非原创', value: 'false' }]"
            :filter-method="(value: string, row: Article) => String(row.copyright_stat === 1 && row.copyright_type === 1) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.copyright_stat === 1 && row.copyright_type === 1 ? 'success' : 'info'" size="small">
                {{ row.copyright_stat === 1 && row.copyright_type === 1 ? '原创' : '非原创' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 20. 是否付费 -->
          <ElTableColumn label="是否付费" min-width="100" sortable
            :filters="[{ text: '付费', value: 'true' }, { text: '免费', value: 'false' }]"
            :filter-method="(value: string, row: Article) => String(row.is_pay_subscribe === 1) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.is_pay_subscribe === 1 ? 'warning' : 'info'" size="small">
                {{ row.is_pay_subscribe === 1 ? '付费' : '免费' }}
              </ElTag>
            </template>
          </ElTableColumn>

          <!-- 21. 付费金额 -->
          <ElTableColumn prop="wecoin_count" label="付费金额" min-width="100">
            <template #default="{ row }">
              {{ row.wecoin_count ? row.wecoin_count + ' 微币' : '--' }}
            </template>
          </ElTableColumn>

          <!-- 22. 文章类型 -->
          <ElTableColumn prop="item_show_type" label="文章类型" min-width="120">
            <template #default="{ row }">
              {{ formatItemShowType(row.item_show_type) }}
            </template>
          </ElTableColumn>

          <!-- 23. 媒体时长 -->
          <ElTableColumn label="媒体时长" min-width="100" sortable :sort-method="(a: Article, b: Article) => durationToSeconds(a.media_duration) - durationToSeconds(b.media_duration)">
            <template #default="{ row }">
              {{ row.media_duration || '--' }}
            </template>
          </ElTableColumn>

          <!-- 24. 所属合集 -->
          <ElTableColumn label="所属合集" min-width="150">
            <template #default="{ row }">
              <GridAlbum v-if="row.appmsg_album_infos?.length" :data="row" />
              <span v-else>--</span>
            </template>
          </ElTableColumn>

          <!-- 25. 操作 -->
          <ElTableColumn label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <GridArticleActions :data="row" :on-preview="preview" :on-goto-link="onGotoLink" />
            </template>
          </ElTableColumn>
        </ElTable>

        <!-- 状态栏：已选 X/Y -->
        <div class="text-sm text-gray-500 px-3 py-1">
          已选 {{ selectedRows.length }} / {{ globalRowData.length }} 条
        </div>
      </div>

      <!-- 分页 -->
      <div
        v-if="pagination.totalPages > 1"
        class="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div class="text-sm text-gray-600 dark:text-gray-400">
          共 {{ pagination.total }} 条记录，第 {{ currentPage }} / {{ pagination.totalPages }} 页
        </div>
        <div class="flex items-center gap-2">
          <ElButton
            :disabled="currentPage === 1"
            @click="currentPage > 1 && (currentPage--, setPage(currentPage), refresh())"
            ><template #icon><UIcon name="i-heroicons-chevron-left" /></template></ElButton
          >
          <div class="flex items-center gap-1 flex-nowrap">
            <ElInput
              type="number"
              v-model="inputPage"
              :min="1"
              :max="pagination.totalPages"
              style="width: 64px; flex-shrink: 0"
              @keyup.enter="handlePageInput"
              @blur="handlePageInput"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">/ {{ pagination.totalPages }}</span>
          </div>
          <ElButton
            :disabled="currentPage === pagination.totalPages"
            @click="currentPage < pagination.totalPages && (currentPage++, setPage(currentPage), refresh())"
            ><template #icon><UIcon name="i-heroicons-chevron-right" /></template></ElButton
          >
          <ElButton
            size="small"
            text
            @click="
              currentPage = 1;
              setPage(1);
              refresh();
            "
          >
            <template #icon><UIcon name="i-heroicons-arrow-uturn-right" /></template>
            <span class="sr-only">刷新</span>
          </ElButton>
        </div>
      </div>
    </div>

    <PreviewArticle ref="previewArticleRef" />

    <!-- 全网文章搜索对话框（含 iframe 预览） -->
    <SearchArticleDialog ref="searchArticleDialogRef" @select:article="selectArticleFromSearch" />
  </div>
</template>
