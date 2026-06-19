/**
 * 查询同步任务进度
 * GET /api/web/data/v1/batch/sync-status
 *
 * 参数：
 *   taskId  - 指定任务ID，返回单个任务状态
 *   （不传 taskId 时返回所有任务列表）
 */

import { getTask, getAllTasks, getActiveTasks } from '~/server/utils/sync-task-manager';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const taskId = query.taskId as string | undefined;

  if (taskId) {
    const task = getTask(taskId);
    if (!task) {
      return successResponse({ found: false }, '任务不存在或已过期');
    }
    return successResponse(task);
  }

  // 返回所有任务（活跃的在前）
  const active = getActiveTasks();
  const all = getAllTasks();
  return successResponse({
    active: active.length,
    tasks: all,
  });
});
