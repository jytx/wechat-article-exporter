/**
 * API 响应格式化工具
 * 统一 API 响应格式和错误处理
 */

/**
 * 成功响应
 */
export function successResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    ...(message && { message })
  };
}

/**
 * 错误响应
 */
export function errorResponse(code: string, message: string, details?: Record<string, any>) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details })
    }
  };
}

/**
 * 分页响应
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  const totalPages = Math.ceil(total / pageSize);

  return {
    success: true,
    data: {
      items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  };
}

/**
 * 错误码定义
 */
export const ErrorCodes = {
  // 认证相关 (AUTH_xxx)
  UNAUTHORIZED: 'AUTH_001',
  AUTH_FAILED: 'AUTH_002',
  SESSION_EXPIRED: 'AUTH_003',
  INSUFFICIENT_PERMISSIONS: 'AUTH_004',

  // 公众号相关 (ACC_xxx)
  ACCOUNT_NOT_FOUND: 'ACC_001',
  ACCOUNT_ALREADY_EXISTS: 'ACC_002',
  ACCOUNT_INVALID: 'ACC_003',

  // 文章相关 (ART_xxx)
  ARTICLE_NOT_FOUND: 'ART_001',
  ARTICLE_ALREADY_DELETED: 'ART_002',
  ARTICLE_INVALID: 'ART_003',

  // 迁移相关 (MIG_xxx)
  MIGRATION_IN_PROGRESS: 'MIG_001',
  MIGRATION_FAILED: 'MIG_002',
  MIGRATION_NOT_FOUND: 'MIG_003',

  // 服务器相关 (SRV_xxx)
  INTERNAL_ERROR: 'SRV_001',
  SERVICE_UNAVAILABLE: 'SRV_002',
  INVALID_REQUEST: 'SRV_003',

  // 验证相关 (VAL_xxx)
  VALIDATION_ERROR: 'VAL_001',
  MISSING_PARAMETER: 'VAL_002',
  INVALID_PARAMETER: 'VAL_003'
} as const;

/**
 * 错误码对应的消息
 */
export const ErrorMessages: Record<string, string> = {
  [ErrorCodes.UNAUTHORIZED]: '未认证',
  [ErrorCodes.AUTH_FAILED]: '认证失败',
  [ErrorCodes.SESSION_EXPIRED]: 'Session 已过期',
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: '权限不足',

  [ErrorCodes.ACCOUNT_NOT_FOUND]: '公众号不存在',
  [ErrorCodes.ACCOUNT_ALREADY_EXISTS]: '公众号已存在',
  [ErrorCodes.ACCOUNT_INVALID]: '公众号信息无效',

  [ErrorCodes.ARTICLE_NOT_FOUND]: '文章不存在',
  [ErrorCodes.ARTICLE_ALREADY_DELETED]: '文章已被删除',
  [ErrorCodes.ARTICLE_INVALID]: '文章信息无效',

  [ErrorCodes.MIGRATION_IN_PROGRESS]: '迁移正在进行中',
  [ErrorCodes.MIGRATION_FAILED]: '迁移失败',
  [ErrorCodes.MIGRATION_NOT_FOUND]: '迁移记录不存在',

  [ErrorCodes.INTERNAL_ERROR]: '服务器内部错误',
  [ErrorCodes.SERVICE_UNAVAILABLE]: '服务暂不可用',
  [ErrorCodes.INVALID_REQUEST]: '无效的请求',

  [ErrorCodes.VALIDATION_ERROR]: '数据验证失败',
  [ErrorCodes.MISSING_PARAMETER]: '缺少必需参数',
  [ErrorCodes.INVALID_PARAMETER]: '参数无效'
};

/**
 * 创建错误
 */
export function createApiError(
  code: string,
  customMessage?: string,
  statusCode: number = 400
) {
  const message = customMessage || ErrorMessages[code] || '未知错误';

  const error = createError({
    statusCode,
    message,
    data: {
      code,
      message
    }
  }) as any;

  error.code = code;
  return error;
}

/**
 * 处理 API 错误
 */
export function handleApiError(error: any) {
  log.error('API 错误:', error);

  // 如果是已知的 API 错误，直接抛出
  if (error.code) {
    throw error;
  }

  // 如果是 HTTP 错误
  if (error.statusCode) {
    throw error;
  }

  // 未知错误，转换为服务器内部错误
  throw createApiError(ErrorCodes.INTERNAL_ERROR);
}

/**
 * 验证请求参数
 */
export function validateParams<T extends Record<string, any>>(
  params: T,
  required: (keyof T)[]
): { valid: boolean; missing?: string[] } {
  const missing: string[] = [];

  for (const key of required) {
    if (!params[key]) {
      missing.push(key as string);
    }
  }

  return {
    valid: missing.length === 0,
    ...(missing.length > 0 && { missing })
  };
}

/**
 * 提取分页参数
 */
export function getPaginationParams(event: H3Event) {
  const query = getQuery(event);

  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const sort = (query.sort as string) || 'update_time';
  const order = (query.order as string) === 'asc' ? 'asc' : 'desc';

  return {
    page,
    pageSize,
    sort,
    order,
    offset: (page - 1) * pageSize
  };
}

/**
 * 提取搜索参数
 */
export function getSearchParams(event: H3Event) {
  const query = getQuery(event);

  return {
    search: (query.search as string) || '',
    status: (query.status as string) || 'all',
    ...getPaginationParams(event)
  };
}
