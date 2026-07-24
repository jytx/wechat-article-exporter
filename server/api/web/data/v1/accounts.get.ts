/**
 * 获取公众号列表
 * GET /api/web/data/v1/accounts
 */

import { getAllAccounts } from '~/server/database/account';
import { getPaginationParams, paginatedResponse } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

export default defineEventHandler(async event => {
  try {
    const { page, pageSize, sort, order } = getPaginationParams(event);

    // 获取所有公众号
    const accounts = await getAllAccounts();

    // 排序
    accounts.sort((a, b) => {
      const aVal = (a as any)[sort] || 0;
      const bVal = (b as any)[sort] || 0;

      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // 分页
    const total = accounts.length;
    const start = (page - 1) * pageSize;
    const items = accounts.slice(start, start + pageSize);

    return paginatedResponse(items, total, page, pageSize);
  } catch (error) {
    log.error('获取公众号列表失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取公众号列表失败',
    });
  }
});
