/**
 * 邮件发送器（nodemailer / SMTP）
 */

import nodemailer from 'nodemailer';
import type { AiSuggestion } from './ai-provider';

export interface EmailConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  from: string;
  to: string[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 构造选题邮件的 HTML 正文
 */
export function buildTopicEmailHtml(suggestions: AiSuggestion[]): string {
  const items = suggestions
    .map((s, i) => {
      const keywords = (s.keywords || [])
        .map(k => `<span style="display:inline-block;background:#eef2ff;color:#4f46e5;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px 4px 2px 0">${escapeHtml(k)}</span>`)
        .join('');
      const refs = (s.references || [])
        .map(r => {
          if (r.link) {
            return `<a href="${escapeHtml(r.link)}" style="color:#2563eb;margin-right:8px">${escapeHtml(r.title || r.link)}</a>`;
          }
          return r.title ? escapeHtml(r.title) : '';
        })
        .filter(Boolean)
        .join('');

      return `
      <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px">
        <div style="font-size:16px;font-weight:600;color:#111827">
          ${i + 1}. ${escapeHtml(s.title)}
        </div>
        ${s.angle ? `<div style="color:#374151;margin-top:8px"><b>切入点：</b>${escapeHtml(s.angle)}</div>` : ''}
        ${s.summary ? `<div style="color:#4b5563;margin-top:6px;line-height:1.6">${escapeHtml(s.summary)}</div>` : ''}
        ${keywords ? `<div style="margin-top:8px">${keywords}</div>` : ''}
        ${refs ? `<div style="margin-top:8px;font-size:13px;color:#6b7280">参考：${refs}</div>` : ''}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111827">
  <h2 style="font-size:20px;border-bottom:2px solid #4f46e5;padding-bottom:8px">📰 AI 选题建议</h2>
  <p style="color:#6b7280;font-size:14px">本次共生成 ${suggestions.length} 个选题建议，供你参考：</p>
  ${items}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#9ca3af;font-size:12px">本邮件由微信公众号导出工具「AI 自动选题」功能自动发送</p>
</body></html>`;
}

/**
 * 发送选题邮件。失败返回 { ok: false, error }，不抛出。
 */
export async function sendTopicEmail(
  emailConfig: EmailConfig,
  suggestions: AiSuggestion[]
): Promise<SendResult> {
  if (!emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPass) {
    return { ok: false, error: 'SMTP 配置不完整' };
  }
  const recipients = (emailConfig.to || []).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: '未配置收件人' };
  }
  if (suggestions.length === 0) {
    return { ok: false, error: '无选题内容可发送' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort || 465,
      secure: emailConfig.smtpSecure,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: emailConfig.from || emailConfig.smtpUser,
      to: recipients.join(','),
      subject: `【AI 选题】${suggestions.length} 个新选题建议 - ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      html: buildTopicEmailHtml(suggestions),
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email-sender] 发送失败:', msg);
    return { ok: false, error: msg };
  }
}
