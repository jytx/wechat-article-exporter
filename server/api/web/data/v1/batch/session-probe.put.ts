/**
 * 保存登录态探活配置
 * PUT /api/web/data/v1/batch/session-probe
 *
 * Body: { enabled: boolean, cron: string }
 *   - 配置变更后会重新调度探活任务
 */

import { getSetting, batchSetSettings } from '~/server/database/settings';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';
import { rescheduleSessionProbe } from '~/server/plugins/session-probe-scheduler';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

interface ProbeBody {
  enabled?: boolean;
  cron?: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<ProbeBody>(event);
    if (!body || typeof body !== 'object') {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '请求体为空');
    }

    const old = safeParse<Record<string, unknown>>(getSetting('session_probe_schedule'), {});
    const merged = {
      enabled: body.enabled !== undefined ? body.enabled : (old.enabled ?? true),
      cron: body.cron !== undefined ? body.cron : (old.cron ?? '0 * * * *'),
    };

    const ok = batchSetSettings([
      { key: 'session_probe_schedule', value: JSON.stringify(merged) },
    ]);
    if (!ok) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '配置保存失败');
    }

    // 重新调度探活任务
    rescheduleSessionProbe(merged.enabled === true, merged.cron || '0 * * * *');

    return successResponse({ saved: true, config: merged }, '配置已保存');
  } catch (err) {
    handleApiError(err);
  }
});
