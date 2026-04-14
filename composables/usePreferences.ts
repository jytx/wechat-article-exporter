import { MP_ORIGIN_TIMESTAMP } from '~/config';
import type { ExportConfig, Preferences } from '~/types/preferences';

const defaultPreferences: Preferences = {
  hideDeleted: true,
  privateProxyList: [],
  privateProxyAuthorization: '',
  exportConfig: {
    exportPath: './exports',
    dirname: '${title}',
    maxlength: 0,
    exportJsonIncludeContent: true,
    exportJsonIncludeComments: true,
    exportExcelIncludeContent: true,
    exportHtmlIncludeComments: true,
  },
  downloadConfig: {
    forceDownloadContent: false,
    metadataOverrideContent: false,
  },
  accountSyncSeconds: 3,
  syncDateRange: 'all',
  syncDatePoint: MP_ORIGIN_TIMESTAMP,
};

// 全局单例：所有组件共享同一个响应式状态
const globalPrefs = ref<Preferences>({ ...defaultPreferences });
let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _watchRegistered = false;

/**
 * 将服务端 key-value 映射为 Preferences
 */
function mapServerData(data: Record<string, string>): Preferences {
  return {
    hideDeleted: data.hide_deleted === 'true',
    privateProxyList: safeJSON<string[]>(data.proxy_list, []),
    privateProxyAuthorization: data.proxy_authorization || '',
    exportConfig: safeJSON<ExportConfig>(data.export_config, defaultPreferences.exportConfig),
    downloadConfig: safeJSON<DownloadConfig>(data.download_config, defaultPreferences.downloadConfig),
    accountSyncSeconds: Number(data.account_sync_seconds) || 3,
    syncDateRange: (data.sync_date_range as Preferences['syncDateRange']) || 'all',
    syncDatePoint: Number(data.sync_date_point) || 0,
  };
}

function safeJSON<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * 从服务端加载设置（只执行一次）
 */
async function ensureLoaded() {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const response = await fetch('/api/web/data/v1/settings', { credentials: 'include' });
      const data = await response.json();
      if (data.success && data.data) {
        globalPrefs.value = mapServerData(data.data);
      }
    } catch (err) {
      console.warn('从服务端加载设置失败，使用默认值:', err);
    } finally {
      _initialized = true;
      _initPromise = null;
    }
  })();

  return _initPromise;
}

export default () => {
  if (import.meta.client && !_initialized) {
    ensureLoaded();

    // 全局 watch：preferences 变化时自动保存到服务端（仅注册一次）
    if (!_watchRegistered) {
      _watchRegistered = true;
      watch(globalPrefs, () => scheduleSaveToServer(globalPrefs.value), { deep: true });
    }
  }

  return globalPrefs;
};

/**
 * 等待设置从服务端加载完成
 * 在 onMounted 中使用：await waitForLoaded()
 */
export async function waitForLoaded() {
  if (_initialized) return;
  await ensureLoaded();
}

/**
 * 保存当前偏好到服务端（防抖）
 */
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveToServer(prefs: Preferences) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const items = [
      { key: 'hide_deleted', value: String(prefs.hideDeleted) },
      { key: 'sync_date_range', value: prefs.syncDateRange },
      { key: 'sync_date_point', value: String(prefs.syncDatePoint) },
      { key: 'account_sync_seconds', value: String(prefs.accountSyncSeconds) },
      { key: 'proxy_list', value: JSON.stringify(prefs.privateProxyList) },
      { key: 'proxy_authorization', value: prefs.privateProxyAuthorization },
      { key: 'export_config', value: JSON.stringify(prefs.exportConfig) },
      { key: 'download_config', value: JSON.stringify(prefs.downloadConfig) },
    ];

    try {
      await fetch('/api/web/data/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items }),
      });
    } catch (err) {
      console.error('保存设置到服务端失败:', err);
    }
  }, 1000);
}
