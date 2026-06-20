/**
 * 文章自动同步调度器
 *
 * 读取 article_sync_schedule 配置，若启用则按 cron 定时同步所有公众号文章。
 * 配置变更时调用 rescheduleArticleSync 重新调度。
 *
 * 利用最新的登录态（cookies 表里的 authKey）驱动后台同步任务。
 * 同步任务串行排队，避免并发触发微信限流。
 */

import cron from 'node-cron';
import { getDatabase } from '~/server/utils/database';
import { getAllSettings } from '~/server/database/settings';
import { getAllAccounts } from '~/server/database/account';
import { startSyncTask, getActiveTasks } from '~/server/utils/sync-task-manager';

let currentJob: cron.ScheduledTask | null = null;

const DEFAULT_CRON = '0 3 * * *';
const SYNC_INTERVAL_SECONDS = 5;

function parseScheduleConfig(): { enabled: boolean; cron: string } {
  const settings = getAllSettings();
  let enabled = false;
  let cronExpr = DEFAULT_CRON;
  try {
    const cfg = settings.article_sync_schedule ? JSON.parse(settings.article_sync_schedule) : {};
    enabled = cfg.enabled === true;
    if (typeof cfg.cron === 'string' && cfg.cron.trim()) cronExpr = cfg.cron.trim();
  } catch {
    // 用默认值
  }
  return { enabled, cron: cronExpr };
}

/**
 * 从 cookies 表获取最新的 authKey
 */
function getLatestAuthKey(): string | null {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT auth_key FROM cookies ORDER BY updated_at DESC LIMIT 1')
      .get() as { auth_key: string } | undefined;
    return row?.auth_key || null;
  } catch {
    return null;
  }
}

/**
 * 执行一次全量自动同步
 */
async function runAutoSync() {
  console.log('[auto-sync] 定时同步触发');

  const authKey = getLatestAuthKey();
  if (!authKey) {
    console.log('[auto-sync] 无有效登录态，跳过（请先扫码登录）');
    return;
  }

  const accounts = await getAllAccounts();
  if (accounts.length === 0) {
    console.log('[auto-sync] 无公众号，跳过');
    return;
  }

  console.log(`[auto-sync] 共 ${accounts.length} 个公众号待同步`);

  let triggered = 0;
  for (const account of accounts) {
    // 去重：已有同步任务在跑则跳过
    const active = getActiveTasks();
    if (active.find(t => t.fakeid === account.fakeid)) {
      continue;
    }

    startSyncTask({
      fakeid: account.fakeid,
      nickname: account.nickname,
      authKey,
      begin: 0,
      maxPages: 50,
      intervalSeconds: SYNC_INTERVAL_SECONDS,
    });
    triggered++;
  }

  console.log(`[auto-sync] 已触发 ${triggered}/${accounts.length} 个公众号的同步任务`);
}

/**
 * 重新调度定时同步任务（配置变更后调用）。
 * 先销毁旧任务，再按新配置创建。
 */
export function rescheduleArticleSync(enabled: boolean, cronExpr: string): boolean {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  if (!enabled) {
    console.log('[auto-sync] 已禁用定时同步');
    return true;
  }

  if (!cron.validate(cronExpr)) {
    console.error(`[auto-sync] cron 表达式非法: ${cronExpr}，跳过调度`);
    return false;
  }

  currentJob = cron.schedule(cronExpr, () => {
    console.log(`[auto-sync] 定时同步触发 ${new Date().toISOString()}`);
    runAutoSync();
  });

  console.log(`[auto-sync] 已启用定时同步：${cronExpr}`);
  return true;
}

export default defineNitroPlugin(() => {
  const { enabled, cron: cronExpr } = parseScheduleConfig();
  rescheduleArticleSync(enabled, cronExpr);
});
