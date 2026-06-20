/**
 * 保存 AI 选题相关配置
 * PUT /api/web/data/v1/topic/config
 *
 * Body: { aiConfig?, emailConfig?, topicSchedule? }
 *   - 密钥字段（apiKey / smtpPass）若值为 '********' 或空，则保留原值不覆盖
 *   - topicSchedule 变更后会重新调度定时任务
 */
import { getSetting, batchSetSettings } from '~/server/database/settings';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';
import { rescheduleTopicJob } from '~/server/plugins/topic-scheduler';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

interface ConfigBody {
  aiConfig?: Record<string, any>;
  emailConfig?: Record<string, any>;
  topicSchedule?: { enabled?: boolean; cron?: string };
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<ConfigBody>(event);
    if (!body || typeof body !== 'object') {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '请求体为空');
    }

    const items: { key: string; value: string }[] = [];

    // ai_config：处理 apiKey 脱敏回写
    if (body.aiConfig) {
      const old = safeParse<Record<string, any>>(getSetting('ai_config'), {});
      const incoming = { ...body.aiConfig };
      // 若前端回传的是脱敏占位或空串，保留原值
      if (!incoming.apiKey || incoming.apiKey === '********') {
        incoming.apiKey = old.apiKey || '';
      }
      items.push({ key: 'ai_config', value: JSON.stringify(incoming) });
    }

    // email_config：处理 smtpPass 脱敏回写
    if (body.emailConfig) {
      const old = safeParse<Record<string, any>>(getSetting('email_config'), {});
      const incoming = { ...body.emailConfig };
      if (!incoming.smtpPass || incoming.smtpPass === '********') {
        incoming.smtpPass = old.smtpPass || '';
      }
      items.push({ key: 'email_config', value: JSON.stringify(incoming) });
    }

    // topic_schedule
    let scheduleChanged = false;
    if (body.topicSchedule) {
      const old = safeParse<Record<string, any>>(getSetting('topic_schedule'), {});
      const merged = { ...old, ...body.topicSchedule };
      items.push({ key: 'topic_schedule', value: JSON.stringify(merged) });
      scheduleChanged =
        old.enabled !== merged.enabled || old.cron !== merged.cron;
    }

    if (items.length === 0) {
      return successResponse({ saved: 0 }, '无配置变更');
    }

    const ok = batchSetSettings(items);
    if (!ok) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '配置保存失败');
    }

    // 若定时配置变更，重新调度
    if (scheduleChanged) {
      const sched = safeParse<Record<string, any>>(getSetting('topic_schedule'), {});
      rescheduleTopicJob(sched.enabled === true, sched.cron || '0 9 * * *');
    }

    return successResponse({ saved: items.length }, '配置已保存');
  } catch (err) {
    handleApiError(err);
  }
});
