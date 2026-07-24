/**
 * 批量搜索公众号（后台任务模式）
 * POST /api/web/data/v1/batch/search-accounts
 *
 * Body:
 *   keywords  - 关键词数组（公众号名称/微信号），如 ["量子位","机器之心"]
 *   autoSave  - 是否自动入库，默认 true
 *
 * 立即返回 taskId，搜索在服务端后台逐个进行（每个间隔 ~1.5s 防限流）。
 * 轮询 GET /api/web/data/v1/batch/search-accounts-status?taskId=xxx 查进度。
 *
 * 依赖微信登录态（searchbiz 需要 token + cookie）。
 */
import { getAuthKeyFromRequest } from '~/server/utils/proxy-request';
import { startSearchAccountsTask, getActiveSearchAccountsTasks } from '~/server/utils/search-accounts-task-manager';
import { successResponse } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface SearchBody {
  keywords: string[];
  autoSave?: boolean;
}

export default defineEventHandler(async event => {
  const body = await readBody<SearchBody>(event);

  if (!body || !Array.isArray(body.keywords) || body.keywords.length === 0) {
    return successResponse({ taskId: null }, '缺少 keywords');
  }

  // 限制单次最多 200 个关键词（防止滥用 + 微信限流）
  const keywords = body.keywords
    .map(k => String(k).trim())
    .filter(k => k.length > 0 && k.length <= 100)
    .slice(0, 200);

  if (keywords.length === 0) {
    return successResponse({ taskId: null }, '关键词无效');
  }

  // 提前提取 authKey（后台任务不持有 event）
  const authKey = getAuthKeyFromRequest(event);
  if (!authKey) {
    return successResponse({ taskId: null, error: '未登录' }, '未登录或登录已过期，请扫码登录');
  }

  // 幂等：已有搜索任务在跑则复用
  const active = getActiveSearchAccountsTasks();
  if (active.length > 0) {
    const running = active[0];
    return successResponse(
      { taskId: running.id, alreadyRunning: true },
      `已有搜索任务在运行（${running.done}/${running.total}）`,
    );
  }

  const taskId = startSearchAccountsTask({
    keywords,
    authKey,
    autoSave: body.autoSave !== false, // 默认 true
  });

  log.info(`[search-accounts] 已启动后台任务 ${taskId}，${keywords.length} 个关键词`);
  return successResponse({ taskId, count: keywords.length }, `开始搜索 ${keywords.length} 个公众号`);
});
