/**
 * 公众号登录态探活调度器
 *
 * 与文章自动同步（metrics-scheduler）解耦：按固定间隔主动探测公众号登录态，
 * 在「有效 → 过期」的跳变点推送一次通知，并写入 SESSION_EXPIRED_KEY 让前端
 * 横幅（SessionExpiredBanner）及时显示。重新登录恢复后自动重置，下次再过期
 * 才会再推一次，避免反复刷屏。
 *
 * 设计要点：
 * - 复用 metrics-scheduler 的 checkSessionValid / getLatestAuthKey / SESSION_EXPIRED_KEY（DRY）。
 * - 探活为「发通知」而设，是否真正发送由 notifier.notify() 按通知配置决定；
 *   调度器默认启用，但用户未在通知页勾选「登录态过期」时不会误发。
 * - 防刷屏：用 mp_session_expired_notified 记录是否已推过，仅状态跳变时推一次。
 */

import cron from 'node-cron';
import { getSetting, setSetting } from '~/server/database/settings';
import {
  checkSessionValid,
  getLatestAuthKey,
  SESSION_EXPIRED_KEY,
} from '~/server/plugins/metrics-scheduler';
import { notify } from '~/server/utils/notifier';
import { log } from '~/server/utils/log';

/** 探活调度配置在 settings 表中的 key */
const PROBE_KEY = 'session_probe_schedule';
/** 默认探活 cron：每小时的整点（每 60 分钟探活一次） */
const DEFAULT_CRON = '0 * * * *';
/** 记录「过期是否已推送过通知」的 key（'1' 已推 / 其它值未推） */
const NOTIFIED_KEY = 'mp_session_expired_notified';

let currentJob: cron.ScheduledTask | null = null;

/**
 * 解析探活调度配置。
 * 解析失败或缺字段时回落到默认值（每 60 分钟，默认启用）。
 */
function parseProbeConfig(): { enabled: boolean; cron: string } {
  let enabled = true;
  let cronExpr = DEFAULT_CRON;
  try {
    const raw = getSetting(PROBE_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as { enabled?: boolean; cron?: string };
      if (cfg.enabled === false) enabled = false;
      if (typeof cfg.cron === 'string' && cfg.cron.trim()) cronExpr = cfg.cron.trim();
    }
  } catch {
    // 用默认值
  }
  return { enabled, cron: cronExpr };
}

/** 读取是否已针对当前过期推送过通知 */
function isExpiredNotified(): boolean {
  return getSetting(NOTIFIED_KEY) === '1';
}

/** 标记当前过期已推送过通知（避免下一轮探活重复推送） */
function markExpiredNotified(): void {
  setSetting(NOTIFIED_KEY, '1');
}

/** 重置「已推送」标记 —— 登录态恢复或重新登录后调用，使下次过期能再次推送 */
function resetExpiredNotified(): void {
  setSetting(NOTIFIED_KEY, '0');
}

/**
 * 格式化过期时间戳为可读的本地时间字符串（用于通知正文）
 */
function formatExpireTime(): string {
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000);
  return date.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 执行一次登录态探活。
 *
 * 状态机（基于 mp_session_expired_notified）：
 *   过期 & 未通知 → 写标记 + 推送一次 + 标记已通知
 *   过期 & 已通知 → 仅写标记（防刷屏，不重复推）
 *   有效 & 已通知 → 清标记 + 重置（下次再过期才能再推）
 *   有效 & 未通知 → 清标记（无需操作）
 */
export async function runSessionProbe(): Promise<void> {
  const authKey = getLatestAuthKey();
  // 无任何登录态：不判过期、不发通知，避免从未登录过的用户被骚扰
  if (!authKey) {
    return;
  }

  const { valid, reason } = await checkSessionValid(authKey);
  const notified = isExpiredNotified();

  if (!valid) {
    // 写入过期标记，触发前端 SessionExpiredBanner 显示
    setSetting(SESSION_EXPIRED_KEY, String(Math.floor(Date.now() / 1000)));

    if (!notified) {
      // 状态跳变：有效 → 过期，推送一次通知
      const timeStr = formatExpireTime();
      const title = '公众号登录态已过期';
      const content = `检测到登录态在 ${timeStr} 已失效（${reason}）。后台定时同步与文章订阅将无法拉取新文章，请尽快重新扫码登录。`;
      const result = await notify('sessionExpired', title, content);
      markExpiredNotified();
      log.warn(`[session-probe] 登录态过期已通知（email=${String(result.email)}, webhook=${String(result.webhook)}）`);
    } else {
      log.warn(`[session-probe] 登录态仍过期，已跳过重复通知（${reason}）`);
    }
    return;
  }

  // 登录态有效：清除过期标记
  setSetting(SESSION_EXPIRED_KEY, '');
  if (notified) {
    // 之前推送过过期通知，现已恢复 → 重置标记，下次再过期才能再次推送
    resetExpiredNotified();
    log.info('[session-probe] 登录态已恢复，重置过期通知标记');
  }
}

/**
 * 重新调度探活任务（配置变更或启动时调用）。
 * 先销毁旧任务，再按新配置创建（三步式，与其它调度器一致）。
 */
export function rescheduleSessionProbe(enabled: boolean, cronExpr: string): boolean {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  if (!enabled) {
    log.info('[session-probe] 已禁用定时探活');
    return true;
  }

  if (!cron.validate(cronExpr)) {
    log.error(`[session-probe] cron 表达式非法: ${cronExpr}，跳过调度`);
    return false;
  }

  currentJob = cron.schedule(cronExpr, () => {
    runSessionProbe();
  });

  log.info(`[session-probe] 已启用定时探活：${cronExpr}`);
  return true;
}

export default defineNitroPlugin(() => {
  const { enabled, cron: cronExpr } = parseProbeConfig();
  rescheduleSessionProbe(enabled, cronExpr);

  // 启动后延迟 30 秒补探一次：让 warmup-cookie-store、数据库先就绪，
  // 尽早暴露过期状态（而非干等到下一个整点）。
  if (!enabled) return;
  setTimeout(() => {
    runSessionProbe();
  }, 30_000);
});
