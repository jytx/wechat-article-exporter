/**
 * 同步任务管理器（内存态，fire-and-forget）
 *
 * 解决"切页面中断同步"的问题：
 * 前端触发同步 → 立即返回 taskId → 服务端在后台 Promise 中跑分页循环
 * → 前端轮询 /sync-status 查询进度 → 完成后刷新列表
 *
 * 任务状态存在内存中，服务重启后丢失（可接受，重新触发即可）。
 */

import { getDatabase } from '~/server/utils/database';
import { cookieStore } from '~/server/utils/CookieStore';
import { saveArticles } from '~/server/database/article';
import { getAccount, updateAccountSyncedCount, updateAccountTotalCount } from '~/server/database/account';
import { log } from '~/server/utils/log';
import { fetchPublishPageWithRetry } from '~/server/utils/wx-publish-api';

export interface SyncTask {
  id: string;
  fakeid: string;
  nickname: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  synced: number; // 本次同步新增的篇数
  totalWx: number; // 微信报告的该公众号文章总数（仅参考，可能与本地不一致）
  dbCount: number; // 数据库实际已存储篇数（同步完成后有意义）
  pagesDone: number;
  maxPages: number;
  message: string;
  error?: string;
  /** 是否增量同步（前端据此决定是否显示进度条） */
  incremental?: boolean;
  /** 用户手动取消标志：runSyncLoop 每页循环检查此字段，为 true 则停止 */
  canceled?: boolean;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

// 内存任务表
const tasks = new Map<string, SyncTask>();

// 自动清理超过 30 分钟的已完成任务
const TASK_TTL_MS = 30 * 60 * 1000;

function cleanupOldTasks() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (
      (task.status === 'completed' || task.status === 'failed') &&
      task.finishedAt &&
      now - task.finishedAt > TASK_TTL_MS
    ) {
      tasks.delete(id);
    }
  }
}

export function getTask(taskId: string): SyncTask | undefined {
  cleanupOldTasks();
  return tasks.get(taskId);
}

export function getActiveTasks(): SyncTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).filter(t => t.status === 'running' || t.status === 'pending');
}

export function getAllTasks(): SyncTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * 取消一个同步任务（协作式取消）。
 *
 * 只设置 canceled 标志，不强制中断当前正在执行的微信请求。
 * runSyncLoop 在每页循环开头检查此标志，pending 任务在出队时检查。
 * 这样既能响应用户的停止操作，又不会因 abort 微信请求而触发风控。
 *
 * @returns true=任务存在且已标记取消；false=任务不存在或已完成
 */
export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  // 已结束的任务无需再取消
  if (task.status === 'completed' || task.status === 'failed') return false;
  task.canceled = true;
  task.updatedAt = Date.now();
  log.info(`[sync-task ${taskId}] 收到取消请求（当前状态: ${task.status}）`);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化同步完成提示。
 * 差额（本地 < 微信总数）是正常的：次条、非图文消息、已删除文章会被跳过。
 */
function formatSyncCompleteMessage(newSynced: number, dbCount: number, wxTotal: number): string {
  const diff = wxTotal - dbCount;
  if (diff > 0) {
    return `同步完成，本次新增 ${newSynced} 篇，该公众号共 ${dbCount} 篇（微信报告 ${wxTotal} 篇，差额 ${diff} 篇为次条/非图文/已删除，已自动跳过）`;
  }
  return `同步完成，本次新增 ${newSynced} 篇，该公众号共 ${dbCount} 篇`;
}

// ========== 串行任务队列 ==========
// 同一时间只允许一个同步任务在跑，避免并发请求触发微信限流/杀 session
let isRunningTask = false;
const taskQueue: Array<() => Promise<void>> = [];

/**
 * 将任务加入队列，串行执行
 */
async function enqueueTask(taskFn: () => Promise<void>): Promise<void> {
  return new Promise(resolve => {
    taskQueue.push(async () => {
      await taskFn();
      resolve();
    });
    processQueue();
  });
}

async function processQueue() {
  if (isRunningTask) return; // 已有任务在跑，等待
  const next = taskQueue.shift();
  if (!next) return;

  isRunningTask = true;
  try {
    await next();
  } finally {
    isRunningTask = false;
    // 队列里还有任务，继续执行下一个（加一点间隔）
    if (taskQueue.length > 0) {
      setTimeout(() => processQueue(), 1000);
    }
  }
}

/**
 * 启动一个后台同步任务
 * 返回 taskId，调用方立即返回给前端。
 * 多个任务会自动排队串行执行（避免并发触发微信限流）。
 */
export function startSyncTask(params: {
  fakeid: string;
  nickname: string;
  authKey: string;
  begin?: number;
  maxPages?: number;
  pageSize?: number;
  intervalSeconds?: number;
  deadline?: number;
  incremental?: boolean;
}): string {
  const taskId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { fakeid, nickname, authKey } = params;

  const pageSize = Math.min(20, params.pageSize || 20);
  const maxPages = Math.min(1000, params.maxPages || 500);
  const intervalSeconds = params.intervalSeconds || 5;
  const deadline = params.deadline || 0;
  const begin = params.begin || 0;

  const task: SyncTask = {
    id: taskId,
    fakeid,
    nickname,
    status: 'pending',
    synced: 0,
    totalWx: 0,
    dbCount: 0,
    pagesDone: 0,
    maxPages,
    incremental: params.incremental || false,
    message: '排队中...',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  tasks.set(taskId, task);

  // 加入串行队列，fire-and-forget
  void enqueueTask(async () => {
    const t = tasks.get(taskId);
    // pending 阶段就被取消了（排在队列里还没轮到执行）：直接标记完成，不进 runSyncLoop
    if (t?.canceled) {
      t.status = 'completed';
      t.message = '已手动停止（任务未开始）';
      t.finishedAt = Date.now();
      t.updatedAt = Date.now();
      log.info(`[sync-task ${taskId}] 任务在排队阶段被取消，跳过执行`);
      return;
    }
    // 任务开始执行时，状态从 pending 改为 running
    if (t && t.status === 'pending') {
      t.status = 'running';
      t.message = '开始同步...';
      t.updatedAt = Date.now();
    }
    await runSyncLoop(taskId, { fakeid, authKey, begin, pageSize, maxPages, intervalSeconds, deadline, incremental: params.incremental || false });
  });

  return taskId;
}

async function runSyncLoop(
  taskId: string,
  params: {
    fakeid: string;
    authKey: string;
    begin: number;
    pageSize: number;
    maxPages: number;
    intervalSeconds: number;
    deadline: number;
    incremental: boolean;
  },
) {
  const task = tasks.get(taskId);
  if (!task) return;

  const { fakeid, authKey, pageSize, maxPages, intervalSeconds, deadline, incremental } = params;
  let begin = params.begin;
  let totalSynced = 0;
  let totalCount = 0;
  let hasMore = true;
  let noNewStreak = 0; // 连续无新增文章的页数（增量同步停止条件）
  let consecutiveErrors = 0; // 连续出错次数（超时/网络异常等），超过阈值则终止任务避免卡死队列
  // 频率限制标记：当请求层重试耗尽后置为 true，完成时据此把任务标记为失败并给出明确提示
  let freqLimited = false;

  // 从 CookieStore 获取 token 和 cookie（用 authKey，不依赖 event）
  const token = await cookieStore.getToken(authKey);
  const cookie = await cookieStore.getCookie(authKey);

  if (!token) {
    task.status = 'failed';
    task.error = '未登录或登录已过期';
    task.message = '同步失败：未登录';
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    return;
  }

  log.info(`[sync-task ${taskId}] 开始同步 ${fakeid}，begin=${begin}，incremental=${incremental}，maxPages=${maxPages}`);

  for (let page = 0; page < maxPages && hasMore; page++) {
    // 用户手动取消：每页循环开头检查，在发起下一次微信请求前退出
    if (task.canceled) {
      task.status = 'completed';
      task.message = `已手动停止（本次同步 ${totalSynced} 篇）`;
      task.synced = totalSynced;
      task.finishedAt = Date.now();
      task.updatedAt = Date.now();
      log.info(`[sync-task ${taskId}] 用户已取消，停止同步（已同步 ${totalSynced} 篇）`);
      return;
    }

    try {
      // 拉取一页（内部已对频率限制做指数退避重试，session 过期/其他错误直接返回）
      const result = await fetchPublishPageWithRetry({
        fakeid,
        begin,
        pageSize,
        token,
        cookie: cookie || '',
        logTag: `sync-task ${taskId}`,
      });

      if (!result.ok) {
        // session 过期：终止任务
        if (result.sessionExpired) {
          task.status = 'failed';
          task.error = 'session expired';
          task.message = `同步了 ${totalSynced} 篇后 session 过期`;
          task.synced = totalSynced;
          task.finishedAt = Date.now();
          task.updatedAt = Date.now();
          log.error(`[sync-task ${taskId}] session 过期`);
          return;
        }
        // 其他业务错误：终止本页循环
        log.error(`[sync-task ${taskId}] 微信返回错误: ${result.errMsg} (code=${result.code})`);
        // 频率限制（200013）：重试已耗尽，标记为限流，完成时给明确提示而非"同步完成"
        if (result.code === 200013) {
          freqLimited = true;
        }
        task.message = freqLimited
          ? `已被微信限流（freq control），请等待几小时后再试`
          : `同步中断：${result.errMsg}`;
        break;
      }

      totalCount = result.page.totalCount || totalCount;
      task.totalWx = totalCount;

      let publishList = result.page.publishList;
      if (publishList.length === 0) {
        // 微信偶尔会返回空列表（即使 total_count 显示还有更多）。
        // 通常 total_count <= begin 时表示确实到底了；否则按"正常结束"处理（重试已在请求层做过）。
        if (totalCount > begin) {
          log.info(`[sync-task ${taskId}] 第 ${page + 1} 页返回空列表但 total_count=${totalCount} > begin=${begin}，按结束处理`);
        }
        hasMore = false;
        break;
      }

      // 解析文章（只取主条 itemidx=1，与原客户端逻辑一致）
      const articles: any[] = [];
      let oldestCreateTime = 0;
      for (const item of publishList) {
        if (!item.publish_info) continue;
        try {
          const info = JSON.parse(item.publish_info);
          for (const a of info.appmsgex || []) {
            // 只保存主条文章（itemidx=1），跳过次条
            if (a.itemidx && a.itemidx !== 1) continue;
            articles.push({
              key: `${fakeid}:${a.aid}`,
              fakeid,
              aid: a.aid,
              title: a.title || '',
              link: a.link || '',
              cover: a.cover || null,
              author: a.author || null,
              create_time: a.create_time || null,
              update_time: a.update_time || null,
              datetime: a.datetime || null,
              digest: a.digest || null,
              album_id: a.album_id || null,
              appmsg_album_infos: a.appmsg_album_infos || [],
              downloaded: 0,
              is_deleted: 0,
            });
            if (a.create_time && (!oldestCreateTime || a.create_time < oldestCreateTime)) {
              oldestCreateTime = a.create_time;
            }
          }
        } catch {
          // 单条解析失败不影响整体
        }
      }

      // 保存（saveArticles 返回真正新增的数量）
      const newCount = articles.length > 0 ? await saveArticles(articles) : 0;
      totalSynced += newCount; // 只累加实际新增数，不是本页文章数

      // 增量同步停止条件：连续 2 页都没有新增文章，说明已翻到旧的（全部已存在），停止。
      // 仅在 incremental=true（增量同步）时启用；全量同步不受此限制，必须翻完。
      // 注意：空页（articles.length === 0）也算"无新增"，否则遇到空页会导致 noNewStreak 被重置、
      // 永不停止（曾导致大公众号在全量模式下狂翻页卡住整个队列）。
      if (incremental && newCount === 0) {
        noNewStreak++;
        if (noNewStreak >= 2) {
          task.message = `增量同步完成：已无新文章（共 ${totalSynced} 篇）`;
          hasMore = false;
          log.info(`[sync-task ${taskId}] 连续 ${noNewStreak} 页无新增，增量停止`);
          break;
        }
      } else {
        noNewStreak = 0;
      }

      // 更新进度
      task.synced = totalSynced;
      task.pagesDone = page + 1;
      const newHint = newCount > 0 ? `，新增 ${newCount}` : '';
      task.message = `已同步 ${totalSynced} 篇${newHint}（第 ${page + 1} 页）`;
      task.updatedAt = Date.now();

      // 检查截止时间
      if (deadline > 0 && oldestCreateTime > 0 && oldestCreateTime < deadline) {
        task.message = `已到截止时间，停止同步（共 ${totalSynced} 篇）`;
        hasMore = false;
        break;
      }

      // 检查是否还有更多：begin 按实际返回的群发消息数推进（微信以消息为单位分页）
      begin += publishList.length;
      // 只有当返回的消息数明显不足（少于一半）时才认为同步完成
      // 微信偶尔会返回不完整的页（如 18/20），不应误判为结束
      if (publishList.length < Math.ceil(pageSize / 2)) {
        hasMore = false;
      }

      log.info(
        `[sync-task ${taskId}] 第 ${page + 1} 页完成，已同步 ${totalSynced} 篇，hasMore=${hasMore}`,
      );

      consecutiveErrors = 0; // 成功完成一页，重置错误计数

      // 间隔防限流
      if (hasMore) {
        await sleep(intervalSeconds * 1000);
      }
    } catch (e: any) {
      consecutiveErrors++;
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      log.error(`[sync-task ${taskId}] 第 ${page + 1} 页异常（连续第 ${consecutiveErrors} 次${isTimeout ? '，超时' : ''}）:`, e?.message || e);

      // 连续 3 次出错（典型如微信挂起超时），终止任务，避免卡死整个串行队列。
      if (consecutiveErrors >= 3) {
        task.status = 'failed';
        task.error = isTimeout ? '请求连续超时' : '连续出错';
        task.message = `第 ${page + 1} 页连续 ${consecutiveErrors} 次失败，终止（已同步 ${totalSynced} 篇）`;
        task.synced = totalSynced;
        task.finishedAt = Date.now();
        task.updatedAt = Date.now();
        log.error(`[sync-task ${taskId}] 连续 ${consecutiveErrors} 次出错，终止任务`);
        return;
      }

      task.message = `第 ${page + 1} 页出错（第 ${consecutiveErrors} 次重试中）`;
      task.updatedAt = Date.now();
      // 单页出错不立即中断，等一个间隔后重试
      await sleep(intervalSeconds * 1000);
    }
  }

  // 更新公众号统计
  const db = getDatabase();
  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM articles WHERE fakeid = ? AND is_deleted = 0')
    .get(fakeid) as { count: number };

  // total_count 和 synced_count 都以数据库实际数量为准
  // 微信的 total_count 不可靠（可能是缓存的旧值），以实际同步到的为准
  const actualCount = countRow.count;
  await updateAccountTotalCount(fakeid, actualCount);
  await updateAccountSyncedCount(fakeid, actualCount);

  // 标记完成（频率限制导致的结束标记为 failed，让前端给出明确提示而非"同步完成"）
  task.status = freqLimited ? 'failed' : 'completed';
  task.synced = totalSynced;
  task.totalWx = totalCount;
  task.dbCount = countRow.count;
  task.message = freqLimited
    ? `已被微信限流，请等待几小时后再试（本次新增 ${totalSynced} 篇）`
    : formatSyncCompleteMessage(totalSynced, countRow.count, totalCount);
  task.finishedAt = Date.now();
  task.updatedAt = Date.now();

  if (freqLimited) {
    task.error = 'freq control';
  }

  log.info(`[sync-task ${taskId}] 同步${freqLimited ? '被限流' : '完成'} ${fakeid}：新增 ${totalSynced}，共 ${countRow.count}/${totalCount}`);
}
