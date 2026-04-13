/**
 * 文章 API Composable
 * 封装所有文章相关的 API 调用
 */

import { api } from '~/utils/api-client';

export interface Article {
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover?: string;
  author?: string;
  create_time: number;
  update_time?: number;
  datetime?: string;
  digest?: string;
  downloaded?: boolean;
  downloadedAt?: string;
  is_deleted?: boolean;
}

export interface ArticleListParams {
  fakeid: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  status?: 'all' | 'downloaded' | 'undownloaded' | 'deleted';
  search?: string;
}

export interface ArticleListResponse {
  items: Article[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface BatchUpdateParams {
  keys: string[];
  action: 'mark_downloaded' | 'mark_deleted' | 'mark_undeleted';
  data?: {
    downloadedAt?: string;
  };
}

/**
 * 文章 API Composable
 */
export function useArticleApi() {
  /**
   * 获取文章列表
   */
  async function getArticles(params: ArticleListParams): Promise<ArticleListResponse> {
    return await api.get<ArticleListResponse>('/articles', params);
  }

  /**
   * 获取文章详情
   */
  async function getArticle(key: string): Promise<Article> {
    return await api.get<Article>(`/articles/${key}`);
  }

  /**
   * 标记文章为已下载
   */
  async function markAsDownloaded(key: string, downloadedAt?: string): Promise<void> {
    return await api.patch(`/articles/${key}/downloaded`, { downloadedAt });
  }

  /**
   * 标记文章为已删除
   */
  async function markAsDeleted(key: string, isDeleted = true): Promise<void> {
    return await api.patch(`/articles/${key}/deleted`, { is_deleted: isDeleted });
  }

  /**
   * 批量更新文章
   */
  async function batchUpdate(params: BatchUpdateParams): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    return await api.post('/articles/batch-update', params);
  }

  /**
   * 批量标记为已下载
   */
  async function batchMarkAsDownloaded(keys: string[]): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    return await batchUpdate({
      keys,
      action: 'mark_downloaded',
      data: {
        downloadedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * 批量标记为已删除
   */
  async function batchMarkAsDeleted(keys: string[]): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    return await batchUpdate({
      keys,
      action: 'mark_deleted',
    });
  }

  /**
   * 批量标记为未删除（恢复）
   */
  async function batchRestore(keys: string[]): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    return await batchUpdate({
      keys,
      action: 'mark_undeleted',
    });
  }

  return {
    getArticles,
    getArticle,
    markAsDownloaded,
    markAsDeleted,
    batchUpdate,
    batchMarkAsDownloaded,
    batchMarkAsDeleted,
    batchRestore,
  };
}

/**
 * 带加载状态的文章 API Composable
 */
export function useArticleApiWithState() {
  const { loading, loadingText, withLoading } = useApiLoading();
  const { error, clearError, catchError } = useApiError();
  const articleApi = useArticleApi();

  /**
   * 获取文章列表（带状态）
   */
  async function fetchArticles(params: ArticleListParams) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.getArticles(params);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '加载文章列表...');
  }

  /**
   * 获取文章详情（带状态）
   */
  async function fetchArticle(key: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.getArticle(key);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '加载文章详情...');
  }

  /**
   * 标记文章为已下载（带状态）
   */
  async function markDownloaded(key: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.markAsDownloaded(key);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '标记中...');
  }

  /**
   * 标记文章为已删除（带状态）
   */
  async function markDeleted(key: string, isDeleted = true) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.markAsDeleted(key, isDeleted);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '标记中...');
  }

  /**
   * 批量标记为已下载（带状态）
   */
  async function batchMarkDownloaded(keys: string[]) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.batchMarkAsDownloaded(keys);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, `批量标记 ${keys.length} 篇文章...`);
  }

  /**
   * 批量标记为已删除（带状态）
   */
  async function batchDelete(keys: string[]) {
    return withLoading(async () => {
      clearError();
      try {
        return await articleApi.batchMarkAsDeleted(keys);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, `批量删除 ${keys.length} 篇文章...`);
  }

  return {
    loading: readonly(loading),
    loadingText: readonly(loadingText),
    error: readonly(error),
    clearError,
    fetchArticles,
    fetchArticle,
    markDownloaded,
    markDeleted,
    batchMarkDownloaded,
    batchDelete,
    // 直接调用其他方法
    batchRestore: articleApi.batchRestore,
    batchUpdate: articleApi.batchUpdate,
  };
}

/**
 * 文章筛选工具 Composable
 */
export function useArticleFilter() {
  const fakeid = ref<string>('');
  const status = ref<'all' | 'downloaded' | 'undownloaded' | 'deleted'>('all');
  const page = ref(1);
  const pageSize = ref(50);
  const search = ref<string>('');

  /**
   * 获取当前筛选参数
   */
  function getParams(): ArticleListParams {
    return {
      fakeid: fakeid.value,
      status: status.value,
      page: page.value,
      pageSize: pageSize.value,
      search: search.value || undefined,
    };
  }

  /**
   * 重置筛选
   */
  function resetFilter() {
    status.value = 'all';
    page.value = 1;
    search.value = '';
  }

  /**
   * 切换公众号
   */
  function switchAccount(newFakeid: string) {
    fakeid.value = newFakeid;
    page.value = 1;
  }

  /**
   * 切换状态
   */
  function switchStatus(newStatus: typeof status.value) {
    status.value = newStatus;
    page.value = 1;
  }

  /**
   * 设置搜索关键词
   */
  function setSearch(keyword: string) {
    search.value = keyword;
    page.value = 1;
  }

  return {
    fakeid: readonly(fakeid),
    status: readonly(status),
    page: readonly(page),
    pageSize: readonly(pageSize),
    search: readonly(search),
    getParams,
    resetFilter,
    switchAccount,
    switchStatus,
    setSearch,
    setPage: (p: number) => {
      page.value = p;
    },
  };
}
