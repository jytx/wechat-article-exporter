/**
 * 通用 API 客户端
 * 提供统一的 API 调用封装，包括请求拦截、响应处理和错误处理
 */

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * API 客户端类
 */
export class ApiClient {
  private baseURL: string;
  private defaultTimeout: number;

  constructor(baseURL: string = '', timeout: number = 30000) {
    this.baseURL = baseURL;
    this.defaultTimeout = timeout;
  }

  /**
   * 发送请求
   */
  async request<T = any>(endpoint: string, options: ApiClientOptions = {}): Promise<T> {
    const { method = 'GET', body, query, headers = {}, timeout = this.defaultTimeout } = options;

    // 构建 URL
    let url = `${this.baseURL}${endpoint}`;

    // 添加查询参数
    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // 构建请求选项
    const fetchOptions: RequestInit = {
      method,
      credentials: 'include', // 携带 Cookie 用于认证
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    // 添加请求体
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // 解析 JSON 响应
      const data: ApiResponse<T> = await response.json();

      // 检查 HTTP 状态码
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || '请求失败');
      }

      // 检查业务状态码
      if (!data.success) {
        throw new Error(data.error?.message || '操作失败');
      }

      return (data as ApiSuccessResponse<T>).data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // 处理超时
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }

      // 处理网络错误
      if (error instanceof TypeError) {
        throw new Error('网络错误，请检查网络连接');
      }

      // 重新抛出业务错误
      throw error;
    }
  }

  /**
   * GET 请求
   */
  async get<T = any>(endpoint: string, query?: Record<string, any>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', query });
  }

  /**
   * POST 请求
   */
  async post<T = any>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  /**
   * PATCH 请求
   */
  async patch<T = any>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

/**
 * 创建默认的 API 客户端实例
 */
export const apiClient = new ApiClient('/api/web/data/v1');

/**
 * 创建认证 API 客户端实例
 */
export const authApiClient = new ApiClient('/api/auth');

/**
 * 创建迁移 API 客户端实例
 */
export const migrationApiClient = new ApiClient('/api/web/data/v1/migration');

/**
 * 创建系统 API 客户端实例
 */
export const systemApiClient = new ApiClient('/api/web/data/v1/system');

/**
 * 创建批量操作 API 客户端实例
 */
export const batchApiClient = new ApiClient('/api/web/data/v1/batch');

/**
 * 快捷方法：使用默认 API 客户端
 */
export const api = {
  get: <T = any>(endpoint: string, query?: Record<string, any>) => apiClient.get<T>(endpoint, query),
  post: <T = any>(endpoint: string, body?: any) => apiClient.post<T>(endpoint, body),
  patch: <T = any>(endpoint: string, body?: any) => apiClient.patch<T>(endpoint, body),
  delete: <T = any>(endpoint: string) => apiClient.delete<T>(endpoint),
};

/**
 * 处理 API 错误的 composable
 */
export function useApiError() {
  const error = ref<string | null>(null);
  const errorCode = ref<string | null>(null);

  /**
   * 清除错误
   */
  function clearError() {
    error.value = null;
    errorCode.value = null;
  }

  /**
   * 捕获错误
   */
  function catchError(err: any) {
    if (err) {
      error.value = err.message || '未知错误';
      errorCode.value = err.code || null;
    }
  }

  return {
    error: readonly(error),
    errorCode: readonly(errorCode),
    clearError,
    catchError,
  };
}

/**
 * API 请求加载状态的 composable
 */
export function useApiLoading() {
  const loading = ref(false);
  const loadingText = ref('');

  /**
   * 开始加载
   */
  function startLoading(text: string = '加载中...') {
    loading.value = true;
    loadingText.value = text;
  }

  /**
   * 结束加载
   */
  function stopLoading() {
    loading.value = false;
    loadingText.value = '';
  }

  /**
   * 包装异步请求，自动处理加载状态
   */
  async function withLoading<T>(fn: () => Promise<T>, text: string = '加载中...'): Promise<T> {
    startLoading(text);
    try {
      const result = await fn();
      return result;
    } finally {
      stopLoading();
    }
  }

  return {
    loading: readonly(loading),
    loadingText: readonly(loadingText),
    startLoading,
    stopLoading,
    withLoading,
  };
}
