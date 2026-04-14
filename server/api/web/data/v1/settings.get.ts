/**
 * 获取设置
 * GET /api/web/data/v1/settings         — 获取全部设置
 * GET /api/web/data/v1/settings?key=xxx  — 获取单个设置
 */

import { getAllSettings, getSetting } from '~/server/database/settings';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const key = query.key as string | undefined;

  if (key) {
    const value = getSetting(key);
    return successResponse({ key, value });
  }

  return successResponse(getAllSettings());
});
