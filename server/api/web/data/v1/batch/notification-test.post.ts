/**
 * 测试发送通知消息
 * POST /api/web/data/v1/batch/notification-test
 *
 * Body: { channel: 'email' | 'webhook' }
 *   - 使用当前已保存的通知配置发送一条测试消息
 *   - 用于在设置页面验证 SMTP / Webhook 配置是否正确
 */

import { getNotificationConfig, sendEmail, sendWebhook } from '~/server/utils/notifier';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';

interface TestBody {
  channel: 'email' | 'webhook';
}

const TEST_TITLE = '【测试通知】微信文章导出器';
const TEST_CONTENT = '这是一条来自微信文章导出器的测试消息。如果你收到了它，说明通知配置是正确的。';

export default defineEventHandler(async event => {
  try {
    const body = await readBody<TestBody>(event);
    if (!body || (body.channel !== 'email' && body.channel !== 'webhook')) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, "channel 必须为 'email' 或 'webhook'");
    }

    const config = getNotificationConfig();

    if (body.channel === 'email') {
      if (!config.email.enabled) {
        throw createApiError(ErrorCodes.INVALID_PARAMETER, '邮箱通知未启用');
      }
      const result = await sendEmail(config.email, TEST_TITLE, TEST_CONTENT);
      if (result === true) {
        return successResponse({ channel: 'email' }, '测试邮件已发送，请检查收件箱');
      }
      throw createApiError(ErrorCodes.INTERNAL_ERROR, `邮件发送失败: ${result.message}`);
    }

    // webhook 渠道
    if (!config.webhook.enabled) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'Webhook 通知未启用');
    }
    const result = await sendWebhook(config.webhook, TEST_TITLE, TEST_CONTENT);
    if (result === true) {
      return successResponse({ channel: 'webhook' }, '测试 Webhook 已发送');
    }
    throw createApiError(ErrorCodes.INTERNAL_ERROR, `Webhook 发送失败: ${result.message}`);
  } catch (err) {
    handleApiError(err);
  }
});
