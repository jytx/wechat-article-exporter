/**
 * 设置数据访问层 (SQLite)
 * key-value 存储，value 为 TEXT（简单值直接存，复合值用 JSON）
 */

import { PUBLIC_PROXY_LIST } from '~/config/public-proxy';
import { getDatabase } from '~/server/utils/database';

export interface SettingItem {
  key: string;
  value: string;
}

/**
 * 默认设置值
 * 建表时用 INSERT OR IGNORE 写入，只在 key 不存在时才插入
 */
const DEFAULT_SETTINGS: SettingItem[] = [
  { key: 'hide_deleted', value: 'true' },
  { key: 'sync_date_range', value: 'all' },
  { key: 'sync_date_point', value: '0' },
  { key: 'account_sync_seconds', value: '3' },
  { key: 'proxy_list', value: JSON.stringify(PUBLIC_PROXY_LIST) },
  { key: 'proxy_authorization', value: '' },
  {
    key: 'export_config',
    value: JSON.stringify({
      dirname: '${title}',
      maxlength: 0,
      exportJsonIncludeContent: true,
      exportJsonIncludeComments: true,
      exportExcelIncludeContent: true,
      exportHtmlIncludeComments: true,
    }),
  },
  {
    key: 'download_config',
    value: JSON.stringify({
      forceDownloadContent: false,
      metadataOverrideContent: false,
    }),
  },
  // —— AI 自动选题相关配置 ——
  {
    key: 'ai_config',
    value: JSON.stringify({
      provider: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      suggestionCount: 5,
      systemPrompt: '',
      articleDays: 7,
      articleLimit: 10,
    }),
  },
  {
    key: 'email_config',
    value: JSON.stringify({
      enabled: false,
      smtpHost: '',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: '',
      smtpPass: '',
      from: '',
      to: [],
    }),
  },
  {
    key: 'topic_schedule',
    value: JSON.stringify({
      enabled: false,
      cron: '0 9 * * *',
    }),
  },
  // —— 文章自动同步调度 ——
  {
    key: 'article_sync_schedule',
    value: JSON.stringify({
      enabled: false,
      cron: '0 3 * * *', // 默认每天凌晨3点
    }),
  },
];

/**
 * 创建 settings 表并初始化默认值
 */
export function initializeSettingsTable() {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // 用 INSERT OR IGNORE 写入默认值（key 已存在则跳过）
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const item of DEFAULT_SETTINGS) {
    stmt.run(item.key, item.value);
  }
}

/**
 * 获取所有设置
 */
export function getAllSettings(): Record<string, string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all() as SettingItem[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/**
 * 获取单个设置
 */
export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * 设置单个值（不存在则插入，存在则更新）
 */
export function setSetting(key: string, value: string): boolean {
  try {
    const db = getDatabase();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s', 'now'))").run(
      key,
      value
    );
    return true;
  } catch (error) {
    console.error('setSetting failed:', error);
    return false;
  }
}

/**
 * 批量设置
 */
export function batchSetSettings(items: SettingItem[]): boolean {
  try {
    const db = getDatabase();
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s', 'now'))"
    );
    db.transaction(() => {
      for (const item of items) {
        stmt.run(item.key, item.value);
      }
    })();
    return true;
  } catch (error) {
    console.error('batchSetSettings failed:', error);
    return false;
  }
}
