/**
 * 保存文章自动同步配置
 * PUT /api/web/data/v1/batch/sync-schedule
 *
 * Body: { enabled: boolean, cron: string }
 *   - 配置变更后会重新调度定时任务
 */

import { getSetting, batchSetSettings } from '~/server/database/settings';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';
import { rescheduleArticleSync } from '~/server/plugins/metrics-scheduler';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

interface ScheduleBody {
  enabled?: boolean;
  cron?: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<ScheduleBody>(event);
    if (!body || typeof body !== 'object') {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '请求体为空');
    }

    const old = safeParse<Record<string, any>>(getSetting('article_sync_schedule'), {});
    const merged = {
      enabled: body.enabled !== undefined ? body.enabled : old.enabled ?? false,
      cron: body.cron !== undefined ? body.cron : old.cron ?? '0 3 * * *',
    };

    const ok = batchSetSettings([
      { key: 'article_sync_schedule', value: JSON.stringify(merged) },
    ]);
    if (!ok) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '配置保存失败');
    }

    // 重新调度
    rescheduleArticleSync(merged.enabled === true, merged.cron || '0 3 * * *');

    return successResponse({ saved: true, config: merged }, '配置已保存');
  } catch (err) {
    handleApiError(err);
  }
});
