/**
 * 查询公众号批量搜索任务进度
 * GET /api/web/data/v1/batch/search-accounts-status
 *
 * 参数：
 *   taskId  - 指定任务ID，返回单个任务状态（含已搜到的结果）
 *   （不传 taskId 时返回活跃任务列表）
 */
import { getSearchAccountsTask, getActiveSearchAccountsTasks } from '~/server/utils/search-accounts-task-manager';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const taskId = query.taskId as string | undefined;

  if (taskId) {
    const task = getSearchAccountsTask(taskId);
    if (!task) {
      return successResponse({ found: false }, '任务不存在或已过期');
    }
    return successResponse(task);
  }

  const active = getActiveSearchAccountsTasks();
  return successResponse({
    active: active.length,
    tasks: active,
  });
});
