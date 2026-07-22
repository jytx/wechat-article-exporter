/**
 * 消息通知配置类型定义
 *
 * 通知渠道支持 SMTP 邮箱 和 Webhook（飞书/企业微信/自定义）。
 * 配置以 JSON 存储在 settings 表的 notification_config 键中。
 */

/** 通知事件类型 —— 决定哪些场景会触发通知 */
export type NotificationEvent = 'syncComplete' | 'sessionExpired' | 'syncFailed';

/** Webhook 平台类型 */
export type WebhookType = 'feishu' | 'wecom' | 'custom';

/** SMTP 邮箱配置 */
export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  to: string;
}

/** Webhook 配置 */
export interface WebhookConfig {
  enabled: boolean;
  type: WebhookType;
  url: string;
}

/** 完整通知配置（持久化到 settings 表） */
export interface NotificationConfig {
  enabled: boolean;
  events: Record<NotificationEvent, boolean>;
  email: EmailConfig;
  webhook: WebhookConfig;
}

/** 通知配置的默认值（首次使用时填充） */
export function createDefaultNotificationConfig(): NotificationConfig {
  return {
    enabled: false,
    events: {
      syncComplete: false,
      sessionExpired: false,
      syncFailed: false,
    },
    email: {
      enabled: false,
      host: '',
      port: 465,
      secure: true,
      user: '',
      pass: '',
      fromName: '微信文章导出器',
      to: '',
    },
    webhook: {
      enabled: false,
      type: 'feishu',
      url: '',
    },
  };
}
