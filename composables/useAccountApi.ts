/**
 * 公众号 API Composable
 * 封装所有公众号相关的 API 调用
 */

import { api } from '~/utils/api-client';

export interface Account {
  fakeid: string;
  nickname: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  total_count: number;
  synced_count: number;
  create_time: number;
  update_time: number;
  stats?: {
    total_articles?: number;
    downloaded_count?: number;
    pending_count?: number;
  };
}

export interface AccountListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
}

export interface AccountListResponse {
  items: Account[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface CreateAccountParams {
  fakeid: string;
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
}

export interface UpdateAccountParams {
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
}

/**
 * 公众号 API Composable
 */
export function useAccountApi() {
  /**
   * 获取公众号列表
   */
  async function getAccounts(params: AccountListParams = {}): Promise<AccountListResponse> {
    return await api.get<AccountListResponse>('/accounts', params);
  }

  /**
   * 获取公众号详情
   */
  async function getAccount(fakeid: string): Promise<Account> {
    return await api.get<Account>(`/accounts/${fakeid}`);
  }

  /**
   * 添加公众号
   */
  async function createAccount(params: CreateAccountParams): Promise<Account> {
    return await api.post<Account>('/accounts', params);
  }

  /**
   * 更新公众号
   */
  async function updateAccount(fakeid: string, params: UpdateAccountParams): Promise<Account> {
    return await api.patch<Account>(`/accounts/${fakeid}`, params);
  }

  /**
   * 删除公众号
   */
  async function deleteAccount(fakeid: string): Promise<void> {
    return await api.delete(`/accounts/${fakeid}`);
  }

  /**
   * 批量导入公众号
   */
  async function importAccounts(accounts: CreateAccountParams[]): Promise<{
    total: number;
    success: number;
    failed: number;
    errors?: Array<{ index: number; fakeid: string; error: string }>;
  }> {
    return await api.post('/batch/import-accounts', { accounts });
  }

  /**
   * 批量删除公众号
   */
  async function deleteAccounts(
    fakeids: string[],
    deleteArticles = true
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    errors?: Array<{ fakeid: string; error: string }>;
  }> {
    return await api.post('/batch/delete-accounts', { fakeids, delete_articles: deleteArticles });
  }

  /**
   * 导出公众号数据
   */
  async function exportAccounts(includeArticles = false): Promise<void> {
    const url = `/batch/export-accounts?include_articles=${includeArticles}`;

    // 创建下载链接
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `wechat-exporter-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(downloadUrl);
  }

  /**
   * 批量同步文章（单页）
   */
  async function syncArticles(
    fakeid: string,
    begin = 0,
    size = 20
  ): Promise<{
    fakeid: string;
    saved: number;
    total: number;
    has_more: boolean;
  }> {
    return await api.post('/batch/sync-articles', { fakeid, begin, size });
  }

  /**
   * 服务端完整同步公众号文章（后台任务，立即返回 taskId）
   * 同步在服务端进行，切页面不中断。
   */
  async function syncAccount(
    fakeid: string,
    options: {
      begin?: number;
      maxPages?: number;
      intervalSeconds?: number;
      deadline?: number;
    } = {},
  ): Promise<{
    taskId: string;
    fakeid: string;
    nickname: string;
    alreadyRunning?: boolean;
    error?: string;
  }> {
    return await api.post('/batch/sync-account', { fakeid, ...options });
  }

  /**
   * 查询同步任务进度
   */
  async function getSyncStatus(taskId?: string): Promise<any> {
    const query = taskId ? { taskId } : {};
    return await api.get('/batch/sync-status', query);
  }

  return {
    getAccounts,
    getAccount,
    createAccount,
    updateAccount,
    deleteAccount,
    importAccounts,
    deleteAccounts,
    exportAccounts,
    syncArticles,
    syncAccount,
    getSyncStatus,
  };
}

/**
 * 带加载状态的公众号 API Composable
 */
export function useAccountApiWithState() {
  const { loading, loadingText, withLoading } = useApiLoading();
  const { error, clearError, catchError } = useApiError();
  const accountApi = useAccountApi();

  /**
   * 获取公众号列表（带状态）
   */
  async function fetchAccounts(params?: AccountListParams) {
    return withLoading(async () => {
      clearError();
      try {
        return await accountApi.getAccounts(params);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '加载公众号列表...');
  }

  /**
   * 获取公众号详情（带状态）
   */
  async function fetchAccount(fakeid: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await accountApi.getAccount(fakeid);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '加载公众号详情...');
  }

  /**
   * 创建公众号（带状态）
   */
  async function createAccount(params: CreateAccountParams) {
    return withLoading(async () => {
      clearError();
      try {
        return await accountApi.createAccount(params);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '添加公众号...');
  }

  /**
   * 更新公众号（带状态）
   */
  async function updateAccount(fakeid: string, params: UpdateAccountParams) {
    return withLoading(async () => {
      clearError();
      try {
        return await accountApi.updateAccount(fakeid, params);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '更新公众号...');
  }

  /**
   * 删除公众号（带状态）
   */
  async function removeAccount(fakeid: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await accountApi.deleteAccount(fakeid);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '删除公众号...');
  }

  return {
    loading: readonly(loading),
    loadingText: readonly(loadingText),
    error: readonly(error),
    clearError,
    fetchAccounts,
    fetchAccount,
    createAccount,
    updateAccount,
    removeAccount,
    // 直接调用其他方法
    importAccounts: accountApi.importAccounts,
    deleteAccounts: accountApi.deleteAccounts,
    exportAccounts: accountApi.exportAccounts,
    syncArticles: accountApi.syncArticles,
    syncAccount: accountApi.syncAccount,
    getSyncStatus: accountApi.getSyncStatus,
  };
}
