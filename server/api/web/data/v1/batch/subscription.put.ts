/**
 * 保存文章订阅配置
 * PUT /api/web/data/v1/batch/subscription
 *
 * Body: SubscriptionConfig（完整的订阅配置对象）
 *   - 配置变更后会重新调度定时推送任务
 */

import { setSetting } from '~/server/database/settings';
import { rescheduleSubscription } from '~/server/plugins/subscription-scheduler';
import { createDefaultSubscriptionConfig } from '~/types/subscription';
import type { SubscriptionConfig } from '~/types/subscription';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const body = await readBody<Partial<SubscriptionConfig>>(event);
    if (!body || typeof body !== 'object') {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '请求体为空');
    }

    // 与默认值合并，保证字段完整性
    const def = createDefaultSubscriptionConfig();
    const config: SubscriptionConfig = {
      enabled: body.enabled ?? def.enabled,
      cron: body.cron || def.cron,
      days: body.days ?? def.days,
      onlyNewArticles: body.onlyNewArticles ?? def.onlyNewArticles,
      maxArticles: body.maxArticles ?? def.maxArticles,
      timeField: body.timeField ?? def.timeField,
    };

    // 保存到 settings 表
    const ok = setSetting('article_subscription', JSON.stringify(config));
    if (!ok) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '订阅配置保存失败');
    }

    // 重新调度
    rescheduleSubscription(config.enabled, config.cron);

    return successResponse({ saved: true, config }, '订阅配置已保存');
  } catch (err) {
    handleApiError(err);
  }
});
