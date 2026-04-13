/**
 * 数据迁移 API Composable
 * 封装所有数据迁移相关的 API 调用
 */

import { migrationApiClient } from '~/utils/api-client';

export interface MigrationProgress {
  total: number;
  migrated: number;
  failed: number;
}

export interface MigrationStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: {
    accounts: MigrationProgress;
    articles: MigrationProgress;
  };
  started_at: string;
  completed_at?: string;
  error?: string;
}

export interface StartMigrationRequest {
  indexeddb_accounts?: number;
  indexeddb_articles?: number;
}

export interface StartMigrationResponse {
  migration_id: string;
  status: string;
  estimated_time: number;
}

export interface VerifyDataResponse {
  accounts_match: boolean;
  articles_match: boolean;
  indexeddb: {
    accounts: number;
    articles: number;
  };
  backend: {
    accounts: number;
    articles: number;
  };
  diff: {
    accounts: number;
    articles: number;
  };
}

export interface ImportDataRequest {
  accounts: Array<{
    fakeid: string;
    nickname?: string;
    alias?: string;
    round_head_img?: string;
    signature?: string;
    total_count?: number;
    synced_count?: number;
  }>;
  articles?: Array<{
    key: string;
    fakeid: string;
    aid: number;
    title: string;
    link: string;
    cover?: string;
    author?: string;
    create_time: number;
    datetime?: string;
    digest?: string;
    downloaded?: boolean;
    downloadedAt?: string;
    is_deleted?: boolean;
  }>;
}

export interface ImportDataResponse {
  accounts_imported: number;
  articles_imported: number;
  errors: string[];
}

/**
 * 数据迁移 API Composable
 */
export function useMigrationApi() {
  /**
   * 开始数据迁移
   */
  async function startMigration(params: StartMigrationRequest): Promise<StartMigrationResponse> {
    return await migrationApiClient.post<StartMigrationResponse>('/start', params);
  }

  /**
   * 查询迁移状态
   */
  async function getMigrationStatus(migrationId: string): Promise<MigrationStatus> {
    return await migrationApiClient.get<MigrationStatus>(`/status/${migrationId}`);
  }

  /**
   * 取消迁移
   */
  async function cancelMigration(migrationId: string): Promise<void> {
    return await migrationApiClient.post<void>(`/cancel/${migrationId}`);
  }

  /**
   * 验证数据一致性
   */
  async function verifyData(indexeddbAccounts: number, indexeddbArticles: number): Promise<VerifyDataResponse> {
    return await migrationApiClient.get<VerifyDataResponse>('/verify', {
      indexeddb_accounts: indexeddbAccounts,
      indexeddb_articles: indexeddbArticles
    });
  }

  /**
   * 导入数据到后端
   */
  async function importData(data: ImportDataRequest): Promise<ImportDataResponse> {
    return await migrationApiClient.post<ImportDataResponse>('/import', data);
  }

  return {
    startMigration,
    getMigrationStatus,
    cancelMigration,
    verifyData,
    importData
  };
}

/**
 * 带加载状态的迁移 API Composable
 */
export function useMigrationApiWithState() {
  const { loading, withLoading } = useApiLoading();
  const { error, clearError, catchError } = useApiError();
  const migrationApi = useMigrationApi();

  /**
   * 开始迁移（带状态）
   */
  async function startMigrationWithState(params: StartMigrationRequest) {
    return withLoading(async () => {
      clearError();
      try {
        return await migrationApi.startMigration(params);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '正在启动数据迁移...');
  }

  /**
   * 查询迁移状态（带状态）
   */
  async function fetchMigrationStatus(migrationId: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await migrationApi.getMigrationStatus(migrationId);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '正在查询迁移状态...');
  }

  /**
   * 取消迁移（带状态）
   */
  async function cancelMigrationWithState(migrationId: string) {
    return withLoading(async () => {
      clearError();
      try {
        return await migrationApi.cancelMigration(migrationId);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '正在取消迁移...');
  }

  /**
   * 验证数据（带状态）
   */
  async function verifyDataWithState(indexeddbAccounts: number, indexeddbArticles: number) {
    return withLoading(async () => {
      clearError();
      try {
        return await migrationApi.verifyData(indexeddbAccounts, indexeddbArticles);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '正在验证数据一致性...');
  }

  /**
   * 导入数据（带状态）
   */
  async function importDataWithState(data: ImportDataRequest) {
    return withLoading(async () => {
      clearError();
      try {
        return await migrationApi.importData(data);
      } catch (err) {
        catchError(err);
        throw err;
      }
    }, '正在导入数据...');
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    clearError,
    startMigration: startMigrationWithState,
    fetchMigrationStatus,
    cancelMigration: cancelMigrationWithState,
    verifyData: verifyDataWithState,
    importData: importDataWithState
  };
}

/**
 * 轮询迁移状态
 */
export function useMigrationPolling(interval = 2000) {
  const { fetchMigrationStatus } = useMigrationApi();
  const currentStatus = ref<MigrationStatus | null>(null);
  const polling = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * 开始轮询
   */
  function startPolling(migrationId: string) {
    if (polling.value) return;

    polling.value = true;

    // 立即查询一次
    fetchMigrationStatus(migrationId)
      .then(status => {
        currentStatus.value = status;

        // 如果迁移已完成或失败，停止轮询
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          stopPolling();
        }
      })
      .catch(err => {
        console.error('查询迁移状态失败:', err);
        stopPolling();
      });

    // 定时查询
    timer = setInterval(async () => {
      try {
        const status = await fetchMigrationStatus(migrationId);
        currentStatus.value = status;

        // 如果迁移已完成或失败，停止轮询
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          stopPolling();
        }
      } catch (err) {
        console.error('轮询迁移状态失败:', err);
        stopPolling();
      }
    }, interval);
  }

  /**
   * 停止轮询
   */
  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    polling.value = false;
  }

  /**
   * 清空状态
   */
  function clearStatus() {
    currentStatus.value = null;
  }

  return {
    currentStatus: readonly(currentStatus),
    polling: readonly(polling),
    startPolling,
    stopPolling,
    clearStatus
  };
}
