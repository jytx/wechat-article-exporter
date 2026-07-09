/**
 * 查询正文补抓任务进度
 * GET /api/web/data/v1/topic/fetch-status
 *
 * 参数：
 *   taskId  - 指定任务ID，返回单个任务状态
 *   （不传 taskId 时返回活跃任务列表 + 当前正文覆盖率）
 */
import {
  getContentFetchTask,
  getActiveContentFetchTasks,
} from '~/server/utils/content-fetch-task-manager';
import { getContentCoverage } from '~/server/database/article-content';
import { getAllSettings } from '~/server/database/settings';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const taskId = query.taskId as string | undefined;

  // 覆盖率统计基于 ai_config.articleDays
  const settings = getAllSettings();
  let articleDays = 7;
  try {
    articleDays = JSON.parse(settings.ai_config || '{}').articleDays ?? 7;
  } catch {
    // 默认值
  }
  const coverage = await getContentCoverage(articleDays);

  if (taskId) {
    const task = getContentFetchTask(taskId);
    if (!task) {
      return successResponse({ found: false, coverage }, '任务不存在或已过期');
    }
    return successResponse({ found: true, task, coverage });
  }

  const active = getActiveContentFetchTasks();
  return successResponse({
    active: active.length,
    tasks: active,
    coverage,
  });
});
