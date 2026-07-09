/**
 * 服务端循环同步公众号文章（后台任务模式）
 * POST /api/web/data/v1/batch/sync-account
 *
 * 立即返回 taskId，同步在服务端后台进行，切页面不中断。
 * 前端通过 GET /api/web/data/v1/batch/sync-status?taskId=xxx 查询进度。
 *
 * Body:
 *   fakeid         - 公众号ID（必需）
 *   begin          - 起始位置，默认 0
 *   maxPages       - 最大分页数，默认 500
 *   intervalSeconds- 每页间隔秒数，默认 5
 *   deadline       - 同步截止时间戳（秒），默认不限
 */

import { getAuthKeyFromRequest } from '~/server/utils/proxy-request';
import { getAccount } from '~/server/database/account';
import { startSyncTask, getActiveTasks } from '~/server/utils/sync-task-manager';
import { successResponse } from '~/server/utils/api-response';

interface SyncAccountBody {
  fakeid: string;
  begin?: number;
  maxPages?: number;
  intervalSeconds?: number;
  deadline?: number;
  incremental?: boolean;
}

export default defineEventHandler(async event => {
  const body = await readBody<SyncAccountBody>(event);

  if (!body.fakeid) {
    return successResponse({ taskId: null }, '缺少 fakeid');
  }

  // 检查该公众号是否已有进行中的同步任务
  const activeTasks = getActiveTasks();
  const existing = activeTasks.find(t => t.fakeid === body.fakeid);
  if (existing) {
    return successResponse(
      { taskId: existing.id, alreadyRunning: true },
      `${existing.nickname} 正在同步中（已同步 ${existing.synced} 篇），请稍候`,
    );
  }

  // 获取 authKey（后台任务不持有 event，需要提前提取）
  const authKey = getAuthKeyFromRequest(event);
  if (!authKey) {
    return successResponse({ taskId: null, error: '未登录' }, '未登录或登录已过期');
  }

  const account = await getAccount(body.fakeid);
  const nickname = account?.nickname || body.fakeid;

  // 启动后台任务，立即返回 taskId
  const taskId = startSyncTask({
    fakeid: body.fakeid,
    nickname,
    authKey,
    begin: body.begin,
    maxPages: body.maxPages,
    intervalSeconds: body.intervalSeconds,
    deadline: body.deadline,
    incremental: body.incremental,
  });

  console.log(`[sync-account] 已启动后台任务 ${taskId}，公众号 ${nickname}`);

  return successResponse(
    { taskId, fakeid: body.fakeid, nickname },
    `${nickname} 同步已开始`,
  );
});
