/**
 * 文章订阅定时调度器
 *
 * 读 article_subscription 配置，若启用则按 cron 定时查询最近 N 天的新文章，
 * 生成 HTML 邮件正文，通过通知系统（邮件 + Webhook）发送给用户。
 *
 * 复用 metrics-scheduler.ts 的 cron 调度模式（reschedule + 启动补跑）。
 */

import cron from 'node-cron';
import { getSetting, setSetting } from '~/server/database/settings';
import { getArticlesAfterTimestamp } from '~/server/database/article';
import { markArticlesAsPushed } from '~/server/database/push-log';
import { getNotificationConfig, sendEmail, sendWebhook } from '~/server/utils/notifier';
import { buildDigestHtml, buildDigestText } from '~/server/utils/digest-builder';
import { createDefaultSubscriptionConfig } from '~/types/subscription';
import type { SubscriptionConfig } from '~/types/subscription';
import { log } from '~/server/utils/log';

let currentJob: cron.ScheduledTask | null = null;

const SUBSCRIPTION_KEY = 'article_subscription';
const LAST_RUN_KEY = 'subscription_last_run';
/** 上次成功推送的时间戳（秒），用于去重：只推送此时间之后的文章 */
const LAST_PUSHED_KEY = 'subscription_last_pushed_at';

/** 从 settings 表读取订阅配置（解析失败时返回默认值） */
function parseSubscriptionConfig(): SubscriptionConfig {
  const raw = getSetting(SUBSCRIPTION_KEY);
  if (!raw) return createDefaultSubscriptionConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<SubscriptionConfig>;
    const def = createDefaultSubscriptionConfig();
    return {
      enabled: parsed.enabled ?? def.enabled,
      cron: parsed.cron || def.cron,
      days: parsed.days ?? def.days,
      onlyNewArticles: parsed.onlyNewArticles ?? def.onlyNewArticles,
      maxArticles: parsed.maxArticles ?? def.maxArticles,
      timeField: parsed.timeField ?? def.timeField,
    };
  } catch {
    return createDefaultSubscriptionConfig();
  }
}

/**
 * 执行一次文章订阅推送（副作用：发邮件 + webhook）。
 * 可被 cron 回调和测试端点调用。
 */
export async function runSubscription(): Promise<{ sent: boolean; articleCount: number; reason: string }> {
  setSetting(LAST_RUN_KEY, String(Math.floor(Date.now() / 1000)));

  const subConfig = parseSubscriptionConfig();
  if (!subConfig.enabled) {
    return { sent: false, articleCount: 0, reason: '订阅未启用' };
  }

  // 检查通知配置：邮箱和 webhook 至少要有一个启用，且 articleDigest 事件勾选了
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.events.articleDigest) {
    return { sent: false, articleCount: 0, reason: '通知未启用或未勾选文章订阅事件' };
  }

  const hasChannel = notifConfig.email.enabled || notifConfig.webhook.enabled;
  if (!hasChannel) {
    return { sent: false, articleCount: 0, reason: '未配置任何通知渠道（邮箱/Webhook）' };
  }

  // 查询文章：根据 timeField 决定用哪个时间字段过滤
  // - create_time（发布时间）：固定查最近 N 天发布的文章
  // - created_at（入库时间）：用上次推送时间做时间窗口，缩小扫描范围
  // 两种模式都通过 article_push_log 表精确去重，同一篇文章只推送一次
  const nowSec = Math.floor(Date.now() / 1000);
  let afterTimestamp: number;

  if (subConfig.timeField === 'create_time') {
    // 按发布时间：固定查最近 N 天
    afterTimestamp = nowSec - subConfig.days * 86400;
  } else {
    // 按入库时间：用上次推送时间做时间窗口（push_log 仍是最终去重保障）
    const lastPushedRaw = getSetting(LAST_PUSHED_KEY);
    afterTimestamp = lastPushedRaw ? parseInt(lastPushedRaw, 10) : (nowSec - subConfig.days * 86400);
  }

  const articles = await getArticlesAfterTimestamp(afterTimestamp, subConfig.maxArticles, subConfig.timeField);
  log.info(`[subscription] 时间字段=${subConfig.timeField}，查到 ${articles.length} 篇未推送文章（上限 ${subConfig.maxArticles}）`);

  if (articles.length === 0 && subConfig.onlyNewArticles) {
    return { sent: false, articleCount: 0, reason: '无新文章，跳过发送' };
  }

  // 生成邮件正文
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const subject = `📰 公众号文章速递 · ${dateStr} · ${articles.length} 篇`;
  const htmlBody = buildDigestHtml(articles, subConfig.days);
  const textBody = buildDigestText(articles);

  // 发邮件
  let anySuccess = false;
  if (notifConfig.email.enabled) {
    const result = await sendEmail(notifConfig.email, subject, textBody, htmlBody);
    if (result === true) {
      anySuccess = true;
      log.info(`[subscription] 邮件已发送给 ${notifConfig.email.to}`);
    } else {
      log.error(`[subscription] 邮件发送失败:`, (result as Error).message);
    }
  }

  // 发 Webhook
  if (notifConfig.webhook.enabled) {
    const result = await sendWebhook(notifConfig.webhook, subject, textBody);
    if (result === true) {
      anySuccess = true;
      log.info(`[subscription] Webhook 已发送（${notifConfig.webhook.type}）`);
    } else {
      const errMsg = (result as Error).message;
      log.error(`[subscription] Webhook 发送失败（${notifConfig.webhook.type}）: ${errMsg}`);
    }
  }

  // 推送成功后，记录已推送的文章（精确去重：下次查询自动排除）
  if (anySuccess && articles.length > 0) {
    const keys = articles.map((a) => a.key);
    const newCount = markArticlesAsPushed(keys);
    log.info(`[subscription] 已标记 ${newCount} 篇文章为已推送`);
  }

  // created_at 模式额外更新时间窗口，缩小下次扫描范围（push_log 是去重主保障）
  if (anySuccess && subConfig.timeField === 'created_at') {
    setSetting(LAST_PUSHED_KEY, String(nowSec));
  }

  return {
    sent: anySuccess,
    articleCount: articles.length,
    reason: anySuccess ? `已发送 ${articles.length} 篇文章` : '所有渠道发送失败',
  };
}

/**
 * 重新调度订阅推送（配置变更后调用）。
 * 先销毁旧任务，再按新配置创建。
 */
export function rescheduleSubscription(enabled: boolean, cronExpr: string): boolean {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  if (!enabled) {
    log.info('[subscription] 已禁用文章订阅');
    return true;
  }

  if (!cron.validate(cronExpr)) {
    log.error(`[subscription] cron 表达式非法: ${cronExpr}，跳过调度`);
    return false;
  }

  currentJob = cron.schedule(cronExpr, () => {
    log.info(`[subscription] 定时推送触发`);
    runSubscription();
  });

  log.info(`[subscription] 已启用文章订阅：${cronExpr}`);
  return true;
}

export default defineNitroPlugin(() => {
  const config = parseSubscriptionConfig();
  rescheduleSubscription(config.enabled, config.cron);

  if (!config.enabled) return;

  // 启动补跑：距上次推送超过 1 个 cron 周期则延迟补跑
  const lastRun = getSetting(LAST_RUN_KEY);
  const nowSec = Math.floor(Date.now() / 1000);
  // 简单策略：超过 12 小时没推过就补跑
  const threshold = 12 * 3600;
  const shouldCatchUp = !lastRun || nowSec - parseInt(lastRun, 10) >= threshold;

  if (shouldCatchUp) {
    log.info('[subscription] 启动补跑：距上次推送时间较长，10 秒后触发');
    setTimeout(() => {
      runSubscription();
    }, 10_000);
  } else {
    log.info('[subscription] 启动检查：距上次推送未超阈值，跳过补跑');
  }
});
