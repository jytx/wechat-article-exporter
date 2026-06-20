/**
 * 触发 AI 选题生成（后台任务模式）
 * POST /api/web/data/v1/topic/generate
 *
 * 立即返回 taskId，生成在服务端后台进行。
 * 前端通过 GET /api/web/data/v1/topic/status?taskId=xxx 查询进度。
 *
 * 选题任务不依赖微信登录态，配置全部从 settings 表读取。
 */
import { startTopicTask, getActiveTopicTasks } from '~/server/utils/topic-task-manager';
import { successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async () => {
  // 幂等：已有任务在跑则直接返回
  const active = getActiveTopicTasks();
  if (active.length > 0) {
    const running = active[0];
    return successResponse(
      { taskId: running.id, alreadyRunning: true },
      `已有选题任务在运行（${running.message}）`,
    );
  }

  const taskId = startTopicTask('manual');
  console.log(`[topic-generate] 已启动后台任务 ${taskId}`);
  return successResponse({ taskId }, '选题生成已开始');
});
