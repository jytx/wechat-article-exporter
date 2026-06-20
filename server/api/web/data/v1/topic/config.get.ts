/**
 * 获取 AI 选题相关配置
 * GET /api/web/data/v1/topic/config
 *
 * 返回 ai_config / email_config / topic_schedule 三项。
 * 注意：apiKey / smtpPass 会脱敏返回（用 hasKey 标识是否已配置）。
 */
import { getSetting } from '~/server/database/settings';
import { successResponse } from '~/server/utils/api-response';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export default defineEventHandler(async () => {
  const aiConfig = safeParse<Record<string, any>>(getSetting('ai_config'), {});
  const emailConfig = safeParse<Record<string, any>>(getSetting('email_config'), {});
  const topicSchedule = safeParse<Record<string, any>>(getSetting('topic_schedule'), {});

  // 脱敏：把密钥替换成空串，单独给个 hasKey 标识，避免明文回传到前端
  const hasApiKey = !!aiConfig.apiKey;
  const hasSmtpPass = !!emailConfig.smtpPass;

  return successResponse({
    aiConfig: {
      provider: aiConfig.provider || 'deepseek',
      apiKey: hasApiKey ? '********' : '',
      hasApiKey,
      baseUrl: aiConfig.baseUrl || 'https://api.deepseek.com/v1',
      model: aiConfig.model || 'deepseek-chat',
      suggestionCount: aiConfig.suggestionCount ?? 5,
      systemPrompt: aiConfig.systemPrompt || '',
    },
    emailConfig: {
      enabled: emailConfig.enabled ?? false,
      smtpHost: emailConfig.smtpHost || '',
      smtpPort: emailConfig.smtpPort ?? 465,
      smtpSecure: emailConfig.smtpSecure ?? true,
      smtpUser: emailConfig.smtpUser || '',
      smtpPass: hasSmtpPass ? '********' : '',
      hasSmtpPass,
      from: emailConfig.from || '',
      to: emailConfig.to || [],
    },
    topicSchedule: {
      enabled: topicSchedule.enabled ?? false,
      cron: topicSchedule.cron || '0 9 * * *',
    },
  });
});
