/**
 * 发送测试邮件，校验 SMTP 配置是否可用
 * POST /api/web/data/v1/topic/test-email
 *
 * Body 可选：{ emailConfig? } —— 若传入则用传入的配置测试（便于保存前先测），
 * 否则用已保存的 settings.email_config。
 */
import { getSetting } from '~/server/database/settings';
import { sendTopicEmail, type EmailConfig } from '~/server/utils/email-sender';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export default defineEventHandler(async event => {
  const body = await readBody<{ emailConfig?: Record<string, any> }>(event).catch(() => ({}));

  let cfg: EmailConfig;
  if (body?.emailConfig && body.emailConfig.smtpHost) {
    // 用传入配置（保存前测试）。smtpPass 若为脱敏占位，回填已保存的真实值
    const incoming = body.emailConfig;
    if (!incoming.smtpPass || incoming.smtpPass === '********') {
      const saved = safeParse<Record<string, any>>(getSetting('email_config'), {});
      incoming.smtpPass = saved.smtpPass || '';
    }
    cfg = {
      enabled: true,
      smtpHost: incoming.smtpHost,
      smtpPort: incoming.smtpPort ?? 465,
      smtpSecure: incoming.smtpSecure ?? true,
      smtpUser: incoming.smtpUser || '',
      smtpPass: incoming.smtpPass || '',
      from: incoming.from || incoming.smtpUser || '',
      to: Array.isArray(incoming.to) ? incoming.to : String(incoming.to || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    };
  } else {
    const saved = safeParse<Record<string, any>>(getSetting('email_config'), {});
    cfg = {
      enabled: true,
      smtpHost: saved.smtpHost || '',
      smtpPort: saved.smtpPort ?? 465,
      smtpSecure: saved.smtpSecure ?? true,
      smtpUser: saved.smtpUser || '',
      smtpPass: saved.smtpPass || '',
      from: saved.from || saved.smtpUser || '',
      to: saved.to || [],
    };
  }

  if (!cfg.smtpHost) {
    throw createApiError(ErrorCodes.MISSING_PARAMETER, '未配置 SMTP 主机');
  }
  if (cfg.to.length === 0) {
    throw createApiError(ErrorCodes.MISSING_PARAMETER, '未配置收件人');
  }

  // 发一封测试邮件（正文为占位选题）
  const result = await sendTopicEmail(cfg, [
    {
      title: '这是一封测试邮件',
      angle: '用于验证 SMTP 配置是否正确',
      summary: '如果你收到了这封邮件，说明 AI 自动选题的邮件配置是通的。',
      keywords: ['测试', 'SMTP'],
    },
  ]);

  if (!result.ok) {
    throw createApiError(ErrorCodes.SERVICE_UNAVAILABLE, `发送失败：${result.error}`);
  }

  return successResponse({ ok: true, messageId: result.messageId }, '测试邮件已发送，请查收');
});
