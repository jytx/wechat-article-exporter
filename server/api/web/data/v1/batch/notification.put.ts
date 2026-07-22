/**
 * 保存消息通知配置
 * PUT /api/web/data/v1/batch/notification
 *
 * Body: NotificationConfig（完整的通知配置对象）
 *   - 以 JSON 存储到 settings 表的 notification_config 键
 */

import { saveNotificationConfig } from '~/server/utils/notifier';
import { createDefaultNotificationConfig } from '~/types/notification';
import type { NotificationConfig } from '~/types/notification';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const body = await readBody<NotificationConfig>(event);
    if (!body || typeof body !== 'object') {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '请求体为空');
    }

    // 与默认值合并，保证字段完整性（前端可能只传部分字段）
    const def = createDefaultNotificationConfig();
    const config: NotificationConfig = {
      enabled: body.enabled ?? def.enabled,
      events: { ...def.events, ...(body.events || {}) },
      email: { ...def.email, ...(body.email || {}) },
      webhook: { ...def.webhook, ...(body.webhook || {}) },
    };

    const ok = saveNotificationConfig(config);
    if (!ok) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '通知配置保存失败');
    }

    return successResponse({ saved: true }, '通知配置已保存');
  } catch (err) {
    handleApiError(err);
  }
});
