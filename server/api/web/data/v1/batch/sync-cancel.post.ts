/**
 * 取消同步任务
 * POST /api/web/data/v1/batch/sync-cancel
 *
 * Body: { taskId: string }
 *   - 协作式取消：标记任务为 canceled，runSyncLoop 下一页循环检查后退出
 *   - pending（排队中）的任务会被直接跳过
 */

import { cancelTask } from '~/server/utils/sync-task-manager';
import { successResponse, createApiError, ErrorCodes, handleApiError } from '~/server/utils/api-response';

interface CancelBody {
  taskId?: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<CancelBody>(event);
    if (!body?.taskId) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, 'taskId 不能为空');
    }

    const canceled = cancelTask(body.taskId);
    if (!canceled) {
      // 任务不存在或已结束，不报错（幂等：重复取消不应失败）
      return successResponse({ canceled: false }, '任务不存在或已结束');
    }

    return successResponse({ canceled: true }, '已发送取消请求');
  } catch (err) {
    handleApiError(err);
  }
});
