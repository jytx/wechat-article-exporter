<script setup lang="ts">
import type {
  ColDef,
  FilterChangedEvent,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ICellRendererParams,
  SelectionChangedEvent,
  ValueFormatterParams,
  ValueGetterParams,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3';
import { defu } from 'defu';
import type { PreviewArticle } from '#components';
import type { Ref } from 'vue';
import { durationToSeconds, formatItemShowType, formatTimeStamp, sleep } from '#shared/utils/helpers';
import { validateHTMLContent } from '#shared/utils/html';
import GridAlbum from '~/components/grid/Album.vue';
import GridArticleActions from '~/components/grid/ArticleActions.vue';
import GridCoverTooltip from '~/components/grid/CoverTooltip.vue';
import GridStatusBar from '~/components/grid/StatusBar.vue';
import AccountSelectorForArticle from '~/components/selector/AccountSelectorForArticle.vue';
import { isDev, websiteName } from '~/config';
import { sharedGridOptions } from '~/config/shared-grid-options';
// 保留：文章内容和留言的本地缓存（这些是下载的内容，不是查询的数据）
import { getCommentCache } from '~/store/v2/comment';
import { getDebugCache } from '~/store/v2/debug';
import { getHtmlCache } from '~/store/v2/html';
import { getMetadataCache, type Metadata } from '~/store/v2/metadata';
	import { isArticleHtmlDownloadedOnServer } from '~/utils/server-html';
import type { Preferences } from '~/types/preferences';
import type { AppMsgExWithFakeID } from '~/types/types';
import type { ArticleMetadata } from '~/utils/download/types';
import { createBooleanColumnFilterParams, createDateColumnFilterParams } from '~/utils/grid';
// 新增：使用文章 API
import { useArticleApiWithState, useArticleFilter } from '~/composables/useArticleApi';
import type { Article as ApiArticle } from '~/types/api';
import { exportArticlesToServer } from '~/utils/server-article-export';
import SearchArticleDialog from '~/components/global/SearchArticleDialog.vue';
import toastFactory from '~/composables/toast';

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

let globalRowData: Article[] = [];

const columnDefs = ref<ColDef[]>([
  {
    headerName: 'ID',
    field: 'aid',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '公众号',
    field: 'account_nickname',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    valueFormatter: p => p.value || '--',
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '链接',
    field: 'link',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 150,
    initialHide: true,
    cellClass: 'font-mono',
  },
  {
    headerName: '标题',
    field: 'title',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    tooltipField: 'title',
    minWidth: 200,
  },
  {
    headerName: '封面',
    field: 'cover',
    sortable: false,
    filter: false,
    cellRenderer: (params: ICellRendererParams) => {
      return `<img alt="" src="${params.value}" style="height: 40px; width: 40px; object-fit: cover;" />`;
    },
    tooltipField: 'cover',
    tooltipComponent: GridCoverTooltip,
    minWidth: 80,
    hide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '摘要',
    field: 'digest',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    tooltipField: 'digest',
    minWidth: 200,
    initialHide: true,
  },
  {
    headerName: '创建时间',
    field: 'create_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : '--'),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      const value = params.getValue('create_time');
      if (value && typeof value === 'number' && value > 0) {
        // 判断是秒级还是毫秒级时间戳（10位是秒，13位是毫秒）
        const timestamp = value < 10000000000 ? value * 1000 : value;
        return new Date(timestamp);
      }
      return null;
    },
    minWidth: 180,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '发布时间',
    field: 'update_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : '--'),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      const value = params.getValue('update_time');
      if (value && typeof value === 'number' && value > 0) {
        // 判断是秒级还是毫秒级时间戳（10位是秒，13位是毫秒）
        const timestamp = value < 10000000000 ? value * 1000 : value;
        return new Date(timestamp);
      }
      return null;
    },
    minWidth: 180,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '是否已删除',
    field: 'is_deleted',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已删除', '未删除'),
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '文章状态',
    field: '_status',
    valueFormatter: p => p.value,
    filter: 'agSetColumnFilter',
    filterParams: {
      valueFormatter: (p: ValueFormatterParams) => p.value,
    },
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '内容已下载',
    field: 'contentDownload',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已下载', '未下载'),
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    field: 'commentDownload',
    headerName: '留言已下载',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已下载', '未下载'),
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '阅读',
    field: 'readNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '点赞',
    field: 'oldLikeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '分享',
    field: 'shareNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '喜欢',
    field: 'likeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '留言',
    field: 'commentNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    field: 'author_name',
    headerName: '作者',
    cellDataType: 'text',
    filter: 'agSetColumnFilter',
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '是否原创',
    valueGetter: p => p.data && p.data.copyright_stat === 1 && p.data.copyright_type === 1,
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('原创', '非原创'),
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '是否付费',
    field: 'is_pay_subscribe',
    valueGetter: p => p.data && p.data.is_pay_subscribe === 1,
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('付费', '免费'),
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '付费金额',
    field: 'wecoin_count',
    valueFormatter: p => (p.value ? `${p.value} 微币` : ''),
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 120,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '文章类型',
    field: 'item_show_type',
    valueFormatter: p => formatItemShowType(p.value),
    filter: 'agSetColumnFilter',
    filterParams: {
      valueFormatter: (p: ValueFormatterParams) => formatItemShowType(p.value),
    },
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '媒体时长',
    field: 'media_duration',
    valueGetter: params => durationToSeconds(params.data.media_duration), // 用于排序和过滤
    valueFormatter: params => params.data.media_duration,
    filter: 'agNumberColumnFilter',
    comparator: (a, b) => a - b,
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '所属合集',
    field: 'appmsg_album_infos',
    cellRenderer: GridAlbum,
    sortable: false,
    filter: false,
    valueFormatter: p =>
      p.value && Array.isArray(p.value) ? p.value.map((album: any) => album.title).join(',') : '--',
    minWidth: 150,
    initialHide: true,
  },
  {
    headerName: '操作',
    field: 'link',
    sortable: false,
    filter: false,
    cellRenderer: GridArticleActions,
    cellRendererParams: {
      onPreview: (params: ICellRendererParams) => {
        preview(params.data);
      },
      onGotoLink: (params: ICellRendererParams) => {
        window.open(params.value, '_blank');
      },
    },
    maxWidth: 100,
    pinned: 'right',
    cellClass: 'flex justify-center items-center',
  },
]);

// 注意，`defu`函数最左边的参数优先级最高
const gridOptions: GridOptions = defu(
  {
    getRowId: (params: GetRowIdParams) => `${params.data.fakeid}:${params.data.aid}`,
    statusBar: {
      statusPanels: [
        {
          statusPanel: GridStatusBar,
          align: 'left',
        },
      ],
    },
  },
  sharedGridOptions
);

const gridApi = shallowRef<GridApi | null>(null);
function onGridReady(params: GridReadyEvent) {
  gridApi.value = params.api;

  restoreColumnState();
}

function onColumnStateChange() {
  if (gridApi.value) {
    saveColumnState();
  }
}
function saveColumnState() {
  const state = gridApi.value?.getColumnState();
  localStorage.setItem('agGridColumnState', JSON.stringify(state));
}

function restoreColumnState() {
  const stateStr = localStorage.getItem('agGridColumnState');
  if (stateStr) {
    const state = JSON.parse(stateStr);
    gridApi.value?.applyColumnState({
      state,
      applyOrder: true,
    });
  }
}

function onFilterChanged(event: FilterChangedEvent) {
  event.api.deselectAll();
}

const preferences = usePreferences();
const hideDeleted = computed(() => (preferences.value as unknown as Preferences).hideDeleted);

const previewArticleRef = ref<typeof PreviewArticle | null>(null);

function preview(article: Article) {
  previewArticleRef.value!.open(article);
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
    globalRowData = articles.filter(article => (hideDeleted.value ? !article.is_deleted : true));
    gridApi.value?.setGridOption('rowData', globalRowData);

	    // 数据加载后重新应用列状态（避免列顺序被重置）
	    await nextTick();
	    restoreColumnState();
  } catch (error: any) {
    console.error('加载文章列表失败:', error);
  } finally {
    tableLoading.value = false;
  }
}

function updateRow(article: Article) {
  const rowNode = gridApi.value?.getRowNode(`${article.fakeid}:${article.aid}`);
  if (rowNode) {
    rowNode.updateData(article);
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
    if (globalRowData.some(r => r.key === key || r.link === link)) {
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
      create_time: (article.create_time && article.create_time > 0) ? article.create_time : null,
      update_time: (article.create_time && article.create_time > 0) ? article.create_time : null,
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
    globalRowData.unshift(newRow);
    await nextTick();
    gridApi.value?.setGridOption('rowData', globalRowData);

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

const selectedArticles = shallowRef<Article[]>([]);
function onSelectionChanged(event: SelectionChangedEvent) {
  selectedArticles.value = (event.selectedNodes || []).map(node => node.data);
}
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
    const article = globalRowData.find(article => article.link === url);
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
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article._status = status;
      updateRow(article);
      // 状态变更暂时不调用 API，因为 _status 是前端扩展字段
    }
  },
  onDelete(url: string) {
    const article = globalRowData.find(article => article.link === url);
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
    const article = globalRowData.find(article => article.link === url);
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
    const article = globalRowData.find(article => article.link === url);
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
      accountName: article.account_nickname || '未知公众号'
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
    const result = await exportArticlesToServer(
      articles,
      exportFormat,
      exportPath,
      (current, total) => {
        exportCompletedCount.value = current;
        exportTotalCount.value = total;
        exportPhase.value = `导出中 ${current}/${total}`;
      }
    );

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
            <UInput
              v-model="searchKeyword"
              placeholder="搜索标题或摘要..."
              color="gray"
              size="md"
              class="w-80"
              @keyup.enter="handleSearch"
              @blur="handleSearch"
            >
              <template v-if="searchKeyword && searchKeyword.length > 0" #trailing>
                <span class="text-gray-400 cursor-pointer hover:text-gray-600" @click="clearSearch">
                  <UIcon name="i-heroicons-x-mark-20-solid" />
                </span>
              </template>
            </UInput>
            <UButton color="white" icon="i-lucide:search" @click="openSearchDialog">全网搜索</UButton>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <UButton
            v-if="downloadBtnLoading"
            color="black"
            @click="stopDownload"
          >
            停止
          </UButton>

          <!-- 抓取按钮组 -->
          <div class="flex items-center gap-0">
            <!-- 主抓取按钮 -->
            <UButton
              :loading="downloadBtnLoading"
              :disabled="!selectedAccount"
              color="white"
              class="font-mono rounded-r-none"
              :label="downloadBtnLoading ? `抓取中 ${downloadCompletedCount}/${downloadTotalCount}` : `抓取 (${downloadTypes.find(t => t.value === selectedDownloadType)?.label})`"
              @click="executeDownload"
            />
            <!-- 下拉选择按钮 -->
            <UPopover>
              <UButton
                :disabled="!selectedAccount || downloadBtnLoading"
                color="white"
                class="font-mono rounded-l-none border-l-0"
                icon="i-heroicons-chevron-down-20-solid"
              />
              <template #panel>
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
              </template>
            </UPopover>
          </div>

          <!-- 导出按钮组 -->
          <div class="flex items-center gap-0">
            <!-- 主导出按钮 -->
            <UButton
              :loading="exportBtnLoading"
              :disabled="!selectedAccount"
              color="white"
              class="font-mono rounded-r-none"
              :label="exportBtnLoading ? `${exportPhase} ${exportCompletedCount}/${exportTotalCount}` : `导出 (${exportFormats.find(f => f.value === selectedExportFormat)?.label})`"
              @click="executeExport"
            />
            <!-- 下拉选择按钮 -->
            <UPopover>
              <UButton
                :disabled="!selectedAccount || exportBtnLoading"
                color="white"
                class="font-mono rounded-l-none border-l-0"
                icon="i-heroicons-chevron-down-20-solid"
              />
              <template #panel>
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
              </template>
            </UPopover>
          </div>

          <UButton
            :disabled="!selectedAccount"
            :icon="copied ? 'i-lucide:check' : 'i-heroicons-link-16-solid'"
            label="复制公众号链接"
            :color="copied ? 'green' : 'blue'"
            @click="copyWechatLink"
          />
          <UButton v-if="isDev" @click="debug">调试</UButton>
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
      <ag-grid-vue
        v-else
        style="width: 100%; height: 100%"
        :loading="tableLoading"
        :rowData="globalRowData"
        :columnDefs="columnDefs"
        :gridOptions="gridOptions"
        @grid-ready="onGridReady"
        @filter-changed="onFilterChanged"
        @column-moved="onColumnStateChange"
        @column-visible="onColumnStateChange"
        @column-pinned="onColumnStateChange"
        @column-resized="onColumnStateChange"
        @selection-changed="onSelectionChanged"
      ></ag-grid-vue>

      <!-- 分页 -->
      <div
        v-if="pagination.totalPages > 1"
        class="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div class="text-sm text-gray-600 dark:text-gray-400">
          共 {{ pagination.total }} 条记录，第 {{ currentPage }} / {{ pagination.totalPages }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-chevron-left"
            :disabled="currentPage === 1"
            @click="currentPage > 1 && (currentPage--, setPage(currentPage), refresh())"
          />
          <div class="flex items-center gap-1">
            <UInput
              type="number"
              v-model="inputPage"
              :min="1"
              :max="pagination.totalPages"
              class="w-16 text-center"
              @keyup.enter="handlePageInput"
              @blur="handlePageInput"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400">/ {{ pagination.totalPages }}</span>
          </div>
          <UButton
            icon="i-heroicons-chevron-right"
            :disabled="currentPage === pagination.totalPages"
            @click="currentPage < pagination.totalPages && (currentPage++, setPage(currentPage), refresh())"
          />
          <UButton
            icon="i-heroicons-arrow-uturn-right"
            size="sm"
            color="gray"
            variant="ghost"
            @click="
              currentPage = 1;
              setPage(1);
              refresh();
            "
          >
            <span class="sr-only">刷新</span>
          </UButton>
        </div>
      </div>
    </div>

    <PreviewArticle ref="previewArticleRef" />

    <!-- 全网文章搜索对话框（含 iframe 预览） -->
    <SearchArticleDialog ref="searchArticleDialogRef" @select:article="selectArticleFromSearch" />
  </div>
</template>
