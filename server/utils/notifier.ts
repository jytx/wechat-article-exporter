/**
 * 消息通知发送器
 *
 * 提供三个层次的 API：
 * - sendEmail / sendWebhook：纯函数，入参为配置对象，不读全局状态
 * - notify：副作用入口，读取 settings 表配置后按事件 + 渠道分发
 *
 * 设计原则：发送函数均为纯函数（仅修改返回值），notify 是唯一的副作用入口。
 */

import nodemailer from 'nodemailer';
import type {
  EmailConfig,
  NotificationConfig,
  NotificationEvent,
  WebhookConfig,
  WebhookType,
} from '~/types/notification';
import { createDefaultNotificationConfig } from '~/types/notification';
import { getSetting, setSetting } from '~/server/database/settings';

/** settings 表中存储通知配置的键名 */
const NOTIFICATION_CONFIG_KEY = 'notification_config';

// ========== 配置读写（settings 表） ==========

/**
 * 从 settings 表读取通知配置。
 * 解析失败或不存在时返回默认配置（纯函数，不修改入参）。
 */
export function getNotificationConfig(): NotificationConfig {
  const raw = getSetting(NOTIFICATION_CONFIG_KEY);
  if (!raw) {
    return createDefaultNotificationConfig();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationConfig>;
    // 与默认值合并，保证新增字段有默认值（向前兼容）
    return mergeConfig(parsed);
  } catch {
    return createDefaultNotificationConfig();
  }
}

/** 将解析出的部分配置与默认值合并（保证字段完整性） */
function mergeConfig(partial: Partial<NotificationConfig>): NotificationConfig {
  const def = createDefaultNotificationConfig();
  return {
    enabled: partial.enabled ?? def.enabled,
    events: { ...def.events, ...(partial.events || {}) },
    email: { ...def.email, ...(partial.email || {}) },
    webhook: { ...def.webhook, ...(partial.webhook || {}) },
  };
}

/** 保存通知配置到 settings 表 */
export function saveNotificationConfig(config: NotificationConfig): boolean {
  return setSetting(NOTIFICATION_CONFIG_KEY, JSON.stringify(config));
}

// ========== 纯函数：邮件发送 ==========

/**
 * 发送 SMTP 邮件（纯函数）。
 * @param config SMTP 配置
 * @param subject 邮件主题
 * @param body   邮件正文（纯文本）
 * @returns 成功返回 true，失败返回 Error 对象
 */
export async function sendEmail(
  config: EmailConfig,
  subject: string,
  body: string,
): Promise<true | Error> {
  if (!config.host || !config.user || !config.pass || !config.to) {
    return new Error('SMTP 配置不完整（缺少 host/user/pass/to）');
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    await transporter.sendMail({
      from: `"${config.fromName || '微信文章导出器'}" <${config.user}>`,
      to: config.to,
      subject,
      text: body,
    });
    return true;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  } finally {
    transporter.close();
  }
}

// ========== 纯函数：Webhook 发送 ==========

/**
 * 根据平台类型构建 webhook 请求体（纯函数）。
 * 飞书和企业微信的消息格式不同，这里做适配。
 */
function buildWebhookPayload(type: WebhookType, title: string, content: string): Record<string, unknown> {
  const text = `${title}\n${content}`;
  switch (type) {
    case 'feishu':
      // 飞书机器人 text 消息格式
      return { msg_type: 'text', content: { text } };
    case 'wecom':
      // 企业微信机器人 text 消息格式
      return { msgtype: 'text', text: { content: text } };
    case 'custom':
    default:
      // 自定义 webhook：发送结构化 JSON，由接收方自行解析
      return { title, content, text, timestamp: Date.now() };
  }
}

/**
 * 发送 Webhook 消息（纯函数）。
 * @param config Webhook 配置
 * @param title   消息标题
 * @param content 消息正文
 * @returns 成功返回 true，失败返回 Error 对象
 */
export async function sendWebhook(
  config: WebhookConfig,
  title: string,
  content: string,
): Promise<true | Error> {
  if (!config.url) {
    return new Error('Webhook URL 不能为空');
  }

  const payload = buildWebhookPayload(config.type, title, content);
  try {
    const resp = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      return new Error(`Webhook 返回 HTTP ${resp.status}`);
    }
    return true;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

// ========== 副作用入口：事件分发 ==========

/** 单次通知的发送结果 */
export interface NotifyResult {
  email: true | Error | 'skipped';
  webhook: true | Error | 'skipped';
}

/**
 * 事件通知入口（副作用函数）。
 *
 * 流程：
 * 1. 读取通知配置；总开关关闭或该事件未勾选 → 直接返回 skipped
 * 2. 按渠道并行发送（邮箱 + webhook 互不阻塞）
 *
 * @param event  事件类型
 * @param title  消息标题
 * @param content 消息正文
 */
export async function notify(
  event: NotificationEvent,
  title: string,
  content: string,
): Promise<NotifyResult> {
  const config = getNotificationConfig();

  // 总开关或该事件未启用 → 跳过
  if (!config.enabled || !config.events[event]) {
    return { email: 'skipped', webhook: 'skipped' };
  }

  const result: NotifyResult = { email: 'skipped', webhook: 'skipped' };

  // 邮箱渠道
  if (config.email.enabled) {
    result.email = await sendEmail(config.email, title, content);
  }

  // webhook 渠道
  if (config.webhook.enabled) {
    result.webhook = await sendWebhook(config.webhook, title, content);
  }

  return result;
}
