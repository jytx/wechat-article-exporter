/**
 * API 相关类型定义
 */

// ========== 认证相关 ==========

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

// ========== 公众号相关 ==========

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
  stats?: AccountStats;
}

export interface AccountStats {
  total_articles?: number;
  downloaded_count?: number;
  pending_count?: number;
}

export interface CreateAccountRequest {
  fakeid: string;
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
}

export interface UpdateAccountRequest {
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
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
  pagination: PaginationInfo;
}

// ========== 文章相关 ==========

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
}

export interface ArticleListResponse {
  items: Article[];
  pagination: PaginationInfo;
}

export interface MarkDownloadedRequest {
  downloadedAt?: string;
}

export interface MarkDeletedRequest {
  is_deleted: boolean;
}

export interface BatchUpdateRequest {
  keys: string[];
  action: 'mark_downloaded' | 'mark_deleted' | 'mark_undeleted';
  data?: {
    downloadedAt?: string;
  };
}

// ========== 批量操作相关 ==========

export interface ImportAccountsRequest {
  accounts: CreateAccountRequest[];
}

export interface ImportAccountsResponse {
  total: number;
  success: number;
  failed: number;
  errors?: ImportError[];
}

export interface ImportError {
  index: number;
  fakeid: string;
  error: string;
}

export interface DeleteAccountsRequest {
  fakeids: string[];
  delete_articles?: boolean;
}

export interface DeleteAccountsResponse {
  total: number;
  success: number;
  failed: number;
  errors?: ImportError[];
}

export interface SyncArticlesRequest {
  fakeid: string;
  begin?: number;
  size?: number;
}

export interface SyncArticlesResponse {
  fakeid: string;
  saved: number;
  total: number;
  has_more: boolean;
}

// ========== 数据迁移相关 ==========

export interface StartMigrationRequest {
  indexeddb_accounts?: number;
  indexeddb_articles?: number;
}

export interface StartMigrationResponse {
  migration_id: string;
  status: string;
  estimated_time: number;
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

export interface MigrationProgress {
  total: number;
  migrated: number;
  failed: number;
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

// ========== 系统相关 ==========

export interface SystemStatusResponse {
  storage: {
    type: string;
    path: string;
    size: number;
    size_formatted: string;
    accounts_count: number;
    articles_count: number;
  };
  system: {
    node_version: string;
    platform: string;
    uptime: number;
    memory: NodeJS.MemoryUsage;
  };
}

export interface ClearCacheRequest {
  type?: 'all' | 'accounts' | 'articles';
}

// ========== 通用类型 ==========

export interface PaginationInfo {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ApiError extends Error {
  code?: string;
  statusCode?: number;
}

// ========== 错误码 ==========

export const ErrorCode = {
  // 认证相关
  UNAUTHORIZED: 'AUTH_001',
  AUTH_FAILED: 'AUTH_002',
  SESSION_EXPIRED: 'AUTH_003',
  INSUFFICIENT_PERMISSIONS: 'AUTH_004',

  // 公众号相关
  ACCOUNT_NOT_FOUND: 'ACC_001',
  ACCOUNT_ALREADY_EXISTS: 'ACC_002',
  ACCOUNT_INVALID: 'ACC_003',

  // 文章相关
  ARTICLE_NOT_FOUND: 'ART_001',
  ARTICLE_ALREADY_DELETED: 'ART_002',
  ARTICLE_INVALID: 'ART_003',

  // 迁移相关
  MIGRATION_IN_PROGRESS: 'MIG_001',
  MIGRATION_FAILED: 'MIG_002',
  MIGRATION_NOT_FOUND: 'MIG_003',

  // 服务器相关
  INTERNAL_ERROR: 'SRV_001',
  SERVICE_UNAVAILABLE: 'SRV_002',
  INVALID_REQUEST: 'SRV_003',

  // 验证相关
  VALIDATION_ERROR: 'VAL_001',
  MISSING_PARAMETER: 'VAL_002',
  INVALID_PARAMETER: 'VAL_003',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
