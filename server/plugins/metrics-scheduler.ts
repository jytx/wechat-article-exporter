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
import { getAllSettings, getSetting, setSetting } from '~/server/database/settings';
import { getAllAccounts } from '~/server/database/account';
import { startSyncTask, getActiveTasks } from '~/server/utils/sync-task-manager';

let currentJob: cron.ScheduledTask | null = null;

const DEFAULT_CRON = '0 3 * * *';
const SYNC_INTERVAL_SECONDS = 5;

/**
 * 估算 cron 表达式对应的「补跑阈值」（秒）：
 * 距上次同步超过这个阈值，启动时就补跑一次。
 *
 * 策略：取 cron 最小重复间隔，再打 0.8 折（略小于一个完整周期），
 * 保证「关机跨过一个触发点」必补跑，同时「服务在当天内重启」不重复触发。
 *
 * - 每隔 N 小时（小时字段为 星号斜杠N）→ N 小时
 * - 一天内多个固定时刻（如 3,15）→ 24h / 时刻数
 * - 每天一次（默认）→ 24 小时
 *
 * 解析失败时回落到 24 小时。
 */
function estimateCatchUpThresholdSec(cronExpr: string): number {
  const parts = cronExpr.trim().split(/\s+/);
  // 标准 5 段 cron：分 时 日 月 周
  const hourField = parts[1] || '3';

  // 每隔 N 小时：*/N
  const every = hourField.match(/^\*\/(\d+)$/);
  if (every) {
    const h = parseInt(every[1], 10);
    if (h > 0 && h < 24) return Math.floor(h * 3600 * 0.8);
  }

  // 一天内多个固定时刻：a,b,c
  if (hourField.includes(',')) {
    const times = hourField.split(',').filter(Boolean);
    if (times.length > 0) return Math.floor((24 / times.length) * 3600 * 0.8);
  }

  // 默认：每天一次 → 24h 的 0.8 折 ≈ 19.2h
  return Math.floor(24 * 3600 * 0.8);
}

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
  // 记录本次触发时间（秒级）。启动补跑逻辑据此判断是否漏跑。
  setSetting('article_sync_last_run', String(Math.floor(Date.now() / 1000)));

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
      // 定时同步走增量模式：连续无新增即停，避免大公众号狂翻页卡住队列。
      // maxPages 作为硬上限保护（正常增量 1-2 页就停了）。
      maxPages: 10,
      intervalSeconds: SYNC_INTERVAL_SECONDS,
      incremental: true,
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

  // 启动补跑：定时已启用时，若距上次同步超过阈值（关机期间漏跑），延迟 10s 补跑一次。
  // 延迟是为了让 warmup-cookie-store、数据库等先就绪。
  if (!enabled) return;

  const lastRun = getSetting('article_sync_last_run');
  const threshold = estimateCatchUpThresholdSec(cronExpr);
  const nowSec = Math.floor(Date.now() / 1000);
  const shouldCatchUp = !lastRun || nowSec - parseInt(lastRun, 10) >= threshold;

  if (shouldCatchUp) {
    const reason = !lastRun
      ? '首次启用，尚无同步记录'
      : `距上次同步已 ${Math.floor((nowSec - parseInt(lastRun, 10)) / 3600)} 小时（阈值 ${Math.floor(threshold / 3600)}h）`;
    console.log(`[auto-sync] 启动补跑：${reason}，10 秒后触发`);
    setTimeout(() => {
      runAutoSync();
    }, 10_000);
  } else {
    console.log(`[auto-sync] 启动检查：距上次同步未超阈值，跳过补跑`);
  }
});
