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
import { cookieStore } from '~/server/utils/CookieStore';
import { log } from '~/server/utils/log';

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

/** settings 表中记录 session 过期时间戳的 key（空值表示未过期） */
export const SESSION_EXPIRED_KEY = 'mp_session_expired_at';

/**
 * 轻量预检：用最新 authKey 请求一次微信接口，判断 session 是否有效。
 * 纯函数 —— 只读不写副作用，由调用方决定如何持久化结果。
 *
 * @returns valid=true 表示 session 有效；valid=false 表示过期或无法验证
 */
async function checkSessionValid(authKey: string): Promise<{ valid: boolean; reason: string }> {
  const token = await cookieStore.getToken(authKey);
  const cookie = await cookieStore.getCookie(authKey);
  if (!token || !cookie) {
    return { valid: false, reason: '无有效 token/cookie' };
  }

  try {
    const urlParams = new URLSearchParams({
      sub: 'list',
      search_field: 'null',
      begin: '0',
      count: '1',
      fakeid: '',
      type: '101_1',
      free_publish_type: '1',
      sub_action: 'list_ex',
      token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    });
    const resp = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsgpublish?${urlParams}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://mp.weixin.qq.com/',
        cookie: cookie || '',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await resp.json();
    // ret=200003 是微信的 session 过期码
    if (data?.base_resp?.ret === 200003) {
      return { valid: false, reason: '微信返回 session 过期（200003）' };
    }
    return { valid: true, reason: '' };
  } catch (e: any) {
    // 网络异常时不判定为过期，避免误报；让后续同步任务自己处理
    log.warn('[auto-sync] session 预检网络异常，跳过预检:', e?.message || e);
    return { valid: true, reason: '预检异常，按有效处理' };
  }
}

/**
 * 执行一次全量自动同步
 */
async function runAutoSync() {
  log.info('[auto-sync] 定时同步触发');
  // 记录本次触发时间（秒级）。启动补跑逻辑据此判断是否漏跑。
  setSetting('article_sync_last_run', String(Math.floor(Date.now() / 1000)));

  const authKey = getLatestAuthKey();
  if (!authKey) {
    log.info('[auto-sync] 无有效登录态，跳过（请先扫码登录）');
    setSetting(SESSION_EXPIRED_KEY, String(Math.floor(Date.now() / 1000)));
    return;
  }

  // session 有效性预检：过期则记录标志、跳过所有公众号的无意义同步。
  // 没有这一步时，10 个公众号会逐个请求微信 → 全部返回 200003，浪费请求且无提醒。
  const { valid, reason } = await checkSessionValid(authKey);
  if (!valid) {
    const ts = Math.floor(Date.now() / 1000);
    setSetting(SESSION_EXPIRED_KEY, String(ts));
    log.warn(`[auto-sync] session 已过期（${reason}），定时同步暂停。请重新扫码登录。`);
    return;
  }

  // session 有效，清除过期标志（可能是重新登录后首次定时触发）
  setSetting(SESSION_EXPIRED_KEY, '');

  const accounts = await getAllAccounts();
  if (accounts.length === 0) {
    log.info('[auto-sync] 无公众号，跳过');
    return;
  }

  log.info(`[auto-sync] 共 ${accounts.length} 个公众号待同步`);

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

  log.info(`[auto-sync] 已触发 ${triggered}/${accounts.length} 个公众号的同步任务`);
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
    log.info('[auto-sync] 已禁用定时同步');
    return true;
  }

  if (!cron.validate(cronExpr)) {
    log.error(`[auto-sync] cron 表达式非法: ${cronExpr}，跳过调度`);
    return false;
  }

  currentJob = cron.schedule(cronExpr, () => {
    log.info(`[auto-sync] 定时同步触发`);
    runAutoSync();
  });

  log.info(`[auto-sync] 已启用定时同步：${cronExpr}`);
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
    log.info(`[auto-sync] 启动补跑：${reason}，10 秒后触发`);
    setTimeout(() => {
      runAutoSync();
    }, 10_000);
  } else {
    log.info(`[auto-sync] 启动检查：距上次同步未超阈值，跳过补跑`);
  }
});
