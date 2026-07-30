<script setup lang="ts">
import dayjs from 'dayjs';
import { onMounted } from 'vue';
import { formatTimeStamp } from '#shared/utils/helpers';
import GridArticleActions from '~/components/grid/ArticleActions.vue';
import PreviewArticle from '~/components/preview/Article.vue';
import SearchArticleDialog from '~/components/global/SearchArticleDialog.vue';
import toastFactory from '~/composables/toast';
import { websiteName } from '~/config';
import { articleDeleted, updateArticleFakeid, updateArticleStatus } from '~/store/v2/article';
import { db } from '~/store/v2/db';
import { getArticleHtmlFromServer } from '~/utils/server-html';
import type { Metadata } from '~/store/v2/metadata';
import type { Preferences } from '~/types/preferences';
import type { AppMsgExWithFakeID } from '~/types/types';
import type { ArticleMetadata } from '~/utils/download/types';
import { exportArticlesToServer } from '~/utils/server-article-export';

useHead({
  title: `单篇文章下载 | ${websiteName}`,
});

interface SingleArticleRow extends Partial<ArticleMetadata> {
  id: string;
  fakeid: string;
  link: string;
  title: string;
  author_name: string;
  digest: string;
  cover?: string;
  create_time: number;
  update_time: number;
  appmsgid: number;
  itemidx: number;
  aid: string;
  contentDownload: boolean;
  commentDownload: boolean;
  accountName?: string | null;
  _status: string;
  is_deleted: boolean;
}

const preferences = usePreferences();

const toast = toastFactory();
const inputUrl = ref('');

// 搜索文章对话框
const searchArticleDialogRef = ref<InstanceType<typeof SearchArticleDialog> | null>(null);

const globalRowData = useLocalStorage<SingleArticleRow[]>('single-article:rows', []);
if (!globalRowData.value) {
  globalRowData.value = [];
}

const tableRef = ref();
const previewArticleRef = ref<typeof PreviewArticle | null>(null);

const selectedRows = ref<SingleArticleRow[]>([]);

function onSelectionChange(val: SingleArticleRow[]) {
  selectedRows.value = val;
}

onMounted(() => {
  globalRowData.value.forEach(row => {
    upsertArticleStub(row);
  });
});

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('链接不能为空');
  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const normalized = hasProtocol ? trimmed : `https://${trimmed}`;
  const parsed = new URL(normalized);
  if (parsed.hostname !== 'mp.weixin.qq.com') {
    throw new Error('请输入有效的公众号文章链接!');
  }
  return parsed.toString();
}

function parseUrlParams(url: string) {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  const fakeid = params.get('__biz') || 'SINGLE_ARTICLE_FAKEID';
  const mid = params.get('mid') || params.get('appmsgid') || `${Date.now()}`;
  const idx = params.get('idx') || params.get('itemidx') || '1';
  return { fakeid, mid: Number(mid), idx: Number(idx) || 1 };
}

function createRow(url: string): SingleArticleRow {
  const { fakeid, mid, idx } = parseUrlParams(url);
  const timestamp = dayjs().unix();
  const aid = `${mid}_${idx}`;
  const generatedId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return {
    id: generatedId,
    fakeid,
    link: url,
    title: '未命名文章',
    author_name: '--',
    digest: '',
    create_time: timestamp,
    update_time: timestamp,
    appmsgid: mid,
    itemidx: idx,
    aid,
    contentDownload: false,
    commentDownload: false,
    accountName: null,
    _status: '',
    is_deleted: false,
  };
}

async function addArticle() {
  try {
    let originalUrl = normalizeUrl(inputUrl.value);
    console.log('添加文章，原始 URL:', originalUrl);

    let finalUrl = originalUrl;
    let resolvedTitle = '';

    // 尝试解析标题（可选，不影响核心功能）
    const isShortLink = originalUrl.includes('/s/') && !originalUrl.includes('__biz=');

    if (isShortLink) {
      console.log('检测到短链接，尝试获取标题');
      try {
        const response = await fetch(`/api/web/misc/resolve-url?url=${encodeURIComponent(originalUrl)}`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (data.success && data.data && data.data.title) {
          resolvedTitle = data.data.title;
          console.log('✅ 获取到标题:', resolvedTitle);
        }
      } catch (error) {
        console.log('获取标题失败，将使用默认标题:', error);
      }
    }

    // 先检查是否已存在
    if (globalRowData.value.some(row => row.link === finalUrl)) {
      toast.info('提示', '该链接已存在列表中');
      return;
    }

    // 使用 URL 创建行（不需要 fakeid 等参数）
    const row = createRow(finalUrl);

    // 如果解析出了标题，使用解析出的值
    if (resolvedTitle) {
      row.title = resolvedTitle;
    }

    console.log('创建的行数据:', row);
    globalRowData.value = [row, ...globalRowData.value];
    await upsertArticleStub(row);
    inputUrl.value = '';
    await downloadRows([row], { silent: true });
  } catch (error: any) {
    console.error('添加文章失败:', error);
    toast.error('添加失败', error?.message || '链接格式不正确');
  }
}

/**
 * 打开搜索文章对话框
 */
function openSearchDialog() {
  searchArticleDialogRef.value?.open();
}

/**
 * 从搜索结果选择文章并添加到列表
 */
async function selectArticleFromSearch(article: any) {
  try {
    console.log('从搜索结果选择文章:', article);

    // 创建行数据
    const row = createRow(article.link);

    // 使用搜索结果的标题和参数
    row.title = article.title || '';
    if (article.fakeid) {
      row.fakeid = article.fakeid;
    }
    if (article.appmsgid) {
      row.appmsgid = article.appmsgid;
    }
    if (article.itemidx) {
      row.itemidx = article.itemidx;
    }
    // 更新 aid
    if (row.appmsgid && row.itemidx) {
      row.aid = `${row.appmsgid}_${row.itemidx}`;
    }

    // 如果有公众号名称，也保存
    if (article.account_nickname) {
      row.accountName = article.account_nickname;
    }

    console.log('创建的行数据:', row);

    // 检查是否已存在
    if (globalRowData.value.some(r => r.link === row.link)) {
      toast.info('提示', '该文章已存在列表中');
      return;
    }

    // 添加到列表
    globalRowData.value = [row, ...globalRowData.value];
    await upsertArticleStub(row);

    toast.success('添加成功', `"${article.title}" 已添加，正在抓取...`);

    // 自动抓取文章内容
    downloadRows([row], { silent: true });
  } catch (error: any) {
    console.error('从搜索添加文章失败:', error);
    toast.error('添加失败', error?.message || '添加失败');
  }
}

function buildVirtualArticle(row: SingleArticleRow): AppMsgExWithFakeID {
  return {
    fakeid: row.fakeid,
    _status: '',
    aid: row.aid,
    album_id: '',
    appmsg_album_infos: [],
    appmsgid: row.appmsgid,
    author_name: row.author_name || '',
    ban_flag: 0,
    checking: 0,
    copyright_stat: 0,
    copyright_type: 0,
    cover: row.cover || '',
    cover_img: row.cover || '',
    cover_img_theme_color: undefined,
    create_time: row.create_time,
    digest: row.digest,
    has_red_packet_cover: 0,
    is_deleted: false,
    is_pay_subscribe: 0,
    item_show_type: 0,
    itemidx: row.itemidx,
    link: row.link,
    media_duration: '0:00',
    mediaapi_publish_status: 0,
    pic_cdn_url_1_1: row.cover || '',
    pic_cdn_url_3_4: row.cover || '',
    pic_cdn_url_16_9: row.cover || '',
    pic_cdn_url_235_1: row.cover || '',
    title: row.title,
    update_time: row.update_time,
    _single: true,
  };
}

function upsertArticleStub(row: SingleArticleRow) {
  return db.article.put(buildVirtualArticle(row), `${row.fakeid}:${row.aid}`);
}

function getSelectedRows(): SingleArticleRow[] {
  return selectedRows.value;
}

function updateRow(article: SingleArticleRow) {
  const idx = globalRowData.value.findIndex(r => r.id === article.id);
  if (idx >= 0) {
    globalRowData.value[idx] = { ...article };
  }
}

function gotoLink(row: SingleArticleRow) {
  if (row.link) {
    window.open(row.link, '_blank', 'noopener');
  }
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
} = useDownloader({
  onFakeID(url: string, fakeid: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.fakeid = fakeid;
      updateRow(article);

      updateArticleFakeid(url, fakeid);
    }
  },
  async onContent(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.contentDownload = true;
      article._status = '正常';
      await updateRowFromHtml(article);

      await updateArticleStatus(url, '正常');

      // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
      article.is_deleted = false;
      await articleDeleted(url, false);

      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update contentDownload`);
    }
  },
  onStatusChange(url: string, status: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article._status = status;
      updateRow(article);

      updateArticleStatus(url, status);
    }
  },
  onDelete(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      article._status = '已删除';
      updateRow(article);

      updateArticleStatus(url, '已删除');
      articleDeleted(url);
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
        updateArticleStatus(url, '正常');

        // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
        article.is_deleted = false;
        articleDeleted(url, false);
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

async function downloadRows(targetRows: SingleArticleRow[], options: { silent?: boolean } = {}) {
  const { silent = false } = options;
  if (targetRows.length === 0) {
    if (!silent) {
      toast.info('提示', '请先选择至少一篇文章');
    }
    return;
  }

  await Promise.all(
    targetRows.map(async row => {
      updateRow(row);
      await upsertArticleStub(row);
    })
  );

  const urls = targetRows.map(row => row.link);
  await download('html', urls);
}

async function updateRowFromHtml(row: SingleArticleRow) {
  const cache = await getArticleHtmlFromServer(row.link);
  if (!cache) {
    console.warn('updateRowFromHtml: cache is null for', row.link);
    return;
  }
  const html = cache.content;
  console.log('updateRowFromHtml: html type:', typeof html, 'length:', html?.length);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 尝试多种方式提取标题
  let title =
    doc.querySelector('#activity-name')?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';

  console.log('updateRowFromHtml: parsed title:', title);

  const author =
    doc.querySelector('#js_author_name')?.textContent?.trim() || doc.querySelector('#js_name')?.textContent?.trim();
  const digest = doc.querySelector('#js_content')?.textContent?.trim()?.slice(0, 160) || row.digest;
  const cover =
    doc.querySelector<HTMLImageElement>('#js_cover')?.getAttribute('data-src') ||
    doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.getAttribute('content') ||
    row.cover ||
    '';
  const publishText = doc.querySelector('#publish_time')?.textContent?.trim();
  const ctMatch = html.match(/var ct = "(?<ts>\d+)";/);

  if (title) row.title = title;
  if (author) row.author_name = author;
  row.accountName = doc.querySelector('#js_name')?.textContent?.trim() || row.accountName || null;
  row.digest = digest || '';
  row.cover = cover;

  if (ctMatch?.groups?.ts) {
    row.update_time = Number(ctMatch.groups.ts);
  } else if (publishText) {
    const parsed = dayjs(publishText);
    if (parsed.isValid()) {
      row.update_time = parsed.unix();
    }
  }

  await db.article.put(
    {
      ...buildVirtualArticle(row),
      digest: row.digest,
      cover: cover,
      cover_img: cover,
      pic_cdn_url_1_1: cover,
      pic_cdn_url_3_4: cover,
      pic_cdn_url_16_9: cover,
      pic_cdn_url_235_1: cover,
    },
    `${row.fakeid}:${row.aid}`
  );
}

function previewRow(row: SingleArticleRow) {
  if (!row.contentDownload) {
    toast.warning('提示', '请先抓取该文章内容');
    return;
  }
  const article = buildVirtualArticle(row) as AppMsgExWithFakeID;
  previewArticleRef.value?.open(article);
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
] as const;

// 当前选择的导出格式
const selectedExportFormat = ref<(typeof exportFormats)[number]['value']>('markdown');

// 执行导出
async function executeExport() {
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

    // 收集文章信息（single 页面每篇文章可能属于不同的公众号）
    const articles = selectedArticles.value.map(article => ({
      url: article.link,
      title: article.title,
      fakeid: article.fakeid,
      accountName: article.accountName || '未知公众号'
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

async function deleteRowData(row: SingleArticleRow) {
  const key = `${row.fakeid}:${row.aid}`;
  await db.transaction('rw', ['article', 'html'], async () => {
    await db.article.delete(key);
    await db.html.delete(row.link);
  });
}

async function removeRows() {
  const rowsToRemove = getSelectedRows();
  if (rowsToRemove.length === 0) {
    toast.info('提示', '请选择要移除的文章');
    return;
  }
  try {
    await Promise.all(rowsToRemove.map(row => deleteRowData(row)));
    const removeIds = new Set(rowsToRemove.map(sel => sel.id));
    globalRowData.value = globalRowData.value.filter(row => !removeIds.has(row.id));
    tableRef.value?.clearSelection();
    toast.success('移除成功', `已移除 ${rowsToRemove.length} 篇文章`);
  } catch (error: any) {
    toast.error('移除失败', error?.message || '删除本地缓存时出错');
  }
}
</script>

<template>
  <div class="h-full">

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部操作区 -->
      <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-3 py-3">
        <div class="flex items-center gap-3">
          <ElInput v-model="inputUrl" placeholder="请输入公众号文章链接" class="w-64 lg:w-96" @keyup.enter="addArticle" />
          <ElButton type="primary" @click="addArticle">添加</ElButton>
          <ElButton @click="openSearchDialog">搜索</ElButton>
        </div>
        <div class="flex items-center gap-3">
          <!-- 抓取按钮组 -->
          <div class="flex items-center gap-0">
            <!-- 主抓取按钮 -->
            <ElButton
              :loading="downloadBtnLoading"
              :disabled="selectedArticleUrls.length === 0"
              type="primary"
              class="font-mono rounded-r-none"
              @click="executeDownload"
            >{{ downloadBtnLoading ? `抓取中 ${downloadCompletedCount}/${downloadTotalCount}` : `抓取 (${downloadTypes.find(t => t.value === selectedDownloadType)?.label})` }}</ElButton
            >
            <!-- 下拉选择按钮 -->
            <ElPopover>
              <template #reference>
                <ElButton
                  :disabled="selectedArticleUrls.length === 0 || downloadBtnLoading"
                  type="primary"
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
              :disabled="selectedArticleUrls.length === 0"
              class="font-mono rounded-r-none"
              @click="executeExport"
            >{{ exportBtnLoading ? `${exportPhase} ${exportCompletedCount}/${exportTotalCount}` : `导出 (${exportFormats.find(f => f.value === selectedExportFormat)?.label})` }}</ElButton
            >
            <!-- 下拉选择按钮 -->
            <ElPopover>
              <template #reference>
                <ElButton
                  :disabled="selectedArticleUrls.length === 0 || exportBtnLoading"
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

          <ElButton type="danger" plain :disabled="selectedArticleUrls.length === 0" @click="removeRows">
            移除
          </ElButton>
        </div>
      </header>

      <div class="flex-1 overflow-hidden p-2">
        <ElTable
          ref="tableRef"
          :data="globalRowData"
          stripe
          border
          height="100%"
          style="width: 100%"
          row-key="id"
          @selection-change="onSelectionChange"
        >
          <ElTableColumn type="selection" width="55" fixed="left" reserve-selection />
          <ElTableColumn prop="fakeid" label="fakeid" min-width="220">
            <template #default="{ row }">
              <span class="font-mono">{{ row.fakeid }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="title" label="标题" min-width="220" sortable show-overflow-tooltip />
          <ElTableColumn prop="link" label="链接" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="font-mono">{{ row.link }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="_status" label="文章状态" min-width="150" sortable />
          <ElTableColumn prop="author_name" label="作者" min-width="140" sortable />
          <ElTableColumn prop="update_time" label="发布时间" min-width="180" sortable>
            <template #default="{ row }">
              {{ row.update_time ? formatTimeStamp(row.update_time) : '--' }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="内容已下载" min-width="140" sortable
            :filters="[{ text: '已下载', value: 'true' }, { text: '未下载', value: 'false' }]"
            :filter-method="(value: string, row: SingleArticleRow) => String(row.contentDownload) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.contentDownload ? 'success' : 'info'" size="small">
                {{ row.contentDownload ? '已下载' : '未下载' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="留言已下载" min-width="140" sortable
            :filters="[{ text: '已下载', value: 'true' }, { text: '未下载', value: 'false' }]"
            :filter-method="(value: string, row: SingleArticleRow) => String(row.commentDownload) === value"
          >
            <template #default="{ row }">
              <ElTag :type="row.commentDownload ? 'success' : 'info'" size="small">
                {{ row.commentDownload ? '已下载' : '未下载' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="readNum" label="阅读" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.readNum }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="oldLikeNum" label="点赞" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.oldLikeNum }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="shareNum" label="分享" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.shareNum }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="likeNum" label="喜欢" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.likeNum }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="commentNum" label="留言" min-width="100" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.commentNum }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <GridArticleActions :data="row" :on-preview="previewRow" :on-goto-link="gotoLink" />
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>

    <PreviewArticle ref="previewArticleRef" />

    <!-- 搜索文章对话框 -->
    <SearchArticleDialog ref="searchArticleDialogRef" @select:article="selectArticleFromSearch" />
  </div>
</template>
