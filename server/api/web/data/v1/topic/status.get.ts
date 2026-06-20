/**
 * 查询选题任务进度
 * GET /api/web/data/v1/topic/status
 *
 * 参数：
 *   taskId  - 指定任务ID，返回单个任务状态
 *   （不传 taskId 时返回所有任务列表）
 */
import { getTopicTask, getAllTopicTasks, getActiveTopicTasks, getLastGeneratedTime } from '~/server/utils/topic-task-manager';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const taskId = query.taskId as string | undefined;

  if (taskId) {
    const task = getTopicTask(taskId);
    if (!task) {
      return successResponse({ found: false }, '任务不存在或已过期');
    }
    return successResponse(task);
  }

  const active = getActiveTopicTasks();
  const all = getAllTopicTasks();
  const lastGeneratedAt = await getLastGeneratedTime();
  return successResponse({
    active: active.length,
    tasks: all,
    lastGeneratedAt,
  });
});
