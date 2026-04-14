/**
 * 更新设置
 * PUT /api/web/data/v1/settings
 * Body: { key: string, value: string } 或 { items: [{ key, value }] }
 */

import { setSetting, batchSetSettings } from '~/server/database/settings';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  // 批量更新
  if (body.items && Array.isArray(body.items)) {
    const success = batchSetSettings(body.items);
    if (!success) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '批量更新设置失败');
    }
    return successResponse({ updated: body.items.length });
  }

  // 单个更新
  if (body.key && body.value !== undefined) {
    const success = setSetting(body.key, String(body.value));
    if (!success) {
      throw createApiError(ErrorCodes.INTERNAL_ERROR, '更新设置失败');
    }
    return successResponse({ key: body.key, value: body.value });
  }

  throw createApiError(ErrorCodes.INVALID_PARAMETER, '请求参数无效');
});
