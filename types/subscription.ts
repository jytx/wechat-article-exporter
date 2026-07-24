/**
 * 文章订阅配置类型定义
 *
 * 定时将最近同步的公众号文章通过邮件/Webhook 推送给用户。
 * 配置以 JSON 存储在 settings 表的 article_subscription 键中。
 */

/** 判断文章"新旧"的时间字段 */
export type SubscriptionTimeField = 'create_time' | 'created_at';

/** 文章订阅配置（持久化到 settings 表） */
export interface SubscriptionConfig {
  /** 总开关 */
  enabled: boolean;
  /** cron 表达式（默认每天早 9 点） */
  cron: string;
  /** 查最近 N 天的文章（默认 1 天） */
  days: number;
  /** 没有新文章时不发送（避免空推送打扰） */
  onlyNewArticles: boolean;
  /** 单次推送最多文章数（默认 200） */
  maxArticles: number;
  /** 判断时间用的字段：create_time=文章发布时间，created_at=入库时间 */
  timeField: SubscriptionTimeField;
}

/** 订阅配置的默认值 */
export function createDefaultSubscriptionConfig(): SubscriptionConfig {
  return {
    enabled: false,
    cron: '0 9 * * *',
    days: 1,
    onlyNewArticles: true,
    maxArticles: 200,
    timeField: 'create_time',
  };
}
