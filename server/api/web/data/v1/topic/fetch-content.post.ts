/**
 * 触发批量补抓文章正文（服务端直连模式）
 * POST /api/web/data/v1/topic/fetch-content
 *
 * Body: { days?: number, limit?: number }
 *   days   - 补抓最近 N 天的文章（默认取 ai_config.articleDays，通常 7）
 *   limit  - 最多补抓多少篇（默认 100，上限 500）
 *
 * 后台 fire-and-forget，立即返回 taskId。
 * 轮询 GET /api/web/data/v1/topic/fetch-status?taskId=xxx 查进度。
 */
import { startContentFetchTask, getActiveContentFetchTasks } from '~/server/utils/content-fetch-task-manager';
import { getAllSettings } from '~/server/database/settings';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  const body = await readBody<{ days?: number; limit?: number }>(event).catch(() => ({}));

  // 默认天数取 ai_config.articleDays
  let defaultDays = 7;
  try {
    const settings = getAllSettings();
    defaultDays = JSON.parse(settings.ai_config || '{}').articleDays ?? 7;
  } catch {
    // 默认值
  }

  const days = Math.max(0, Math.min(90, Number(body?.days ?? defaultDays)));
  const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));

  // 幂等：已有补抓任务在跑则复用
  const active = getActiveContentFetchTasks();
  if (active.length > 0) {
    const running = active[0];
    return successResponse(
      { taskId: running.id, alreadyRunning: true },
      `已有补抓任务在运行（${running.message}）`,
    );
  }

  const taskId = startContentFetchTask(days, limit);
  console.log(`[fetch-content] 已启动补抓任务 ${taskId}（days=${days}, limit=${limit}，直连模式）`);
  return successResponse({ taskId }, '正文补抓已开始');
});
