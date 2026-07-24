/**
 * 公众号批量搜索任务（后台 fire-and-forget，照抄 sync-task-manager 模式）
 *
 * 流程：API 端点提前提取 authKey → 后台循环逐个关键词调微信 searchbiz
 *      → 取每个关键词第 1 个结果 → 自动存入 accounts 表
 *
 * 依赖微信登录态（searchbiz 需要 token + cookie）。每个关键词间隔防限流。
 */

import { cookieStore } from '~/server/utils/CookieStore';
import { saveAccount } from '~/server/database/account';
import { USER_AGENT } from '~/config';
import { log } from '~/server/utils/log';

export interface SearchedAccount {
  keyword: string;
  found: boolean;
  fakeid?: string;
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  // 搜索质量：结果昵称是否包含关键词
  matched?: boolean;
}

export interface SearchAccountsTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
  total: number;
  done: number;
  found: number;
  saved: number;
  results: SearchedAccount[];
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
}

const tasks = new Map<string, SearchAccountsTask>();
const TASK_TTL_MS = 30 * 60 * 1000;
const INTERVAL_MS = 1500; // 每个关键词间隔（微信对搜索频率敏感）

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

export function getSearchAccountsTask(taskId: string): SearchAccountsTask | undefined {
  cleanupOldTasks();
  return tasks.get(taskId);
}

export function getActiveSearchAccountsTasks(): SearchAccountsTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).filter(t => t.status === 'running' || t.status === 'pending');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 调微信 searchbiz 搜单个关键词，返回第 1 个结果
 */
async function searchOneKeyword(
  keyword: string,
  token: string,
  cookie: string
): Promise<SearchedAccount> {
  const params = new URLSearchParams({
    action: 'search_biz',
    begin: '0',
    count: '5',
    query: keyword,
    token,
    lang: 'zh_CN',
    f: 'json',
    ajax: '1',
  });

  const resp = await fetch(`https://mp.weixin.qq.com/cgi-bin/searchbiz?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://mp.weixin.qq.com/',
      Origin: 'https://mp.weixin.qq.com',
      cookie: cookie || '',
    },
  });
  const data = await resp.json();

  // session 过期
  if (data.base_resp?.ret === 200003) {
    throw new Error('session expired');
  }
  if (data.base_resp?.ret !== 0) {
    return { keyword, found: false };
  }

  const list = data.list || [];
  if (list.length === 0) {
    return { keyword, found: false };
  }

  const first = list[0];
  // 判断昵称是否包含关键词（粗略的匹配质量判断）
  const nickname: string = first.nickname || '';
  const matched = nickname.includes(keyword) || (first.alias || '').includes(keyword);

  return {
    keyword,
    found: true,
    fakeid: first.fakeid,
    nickname,
    alias: first.alias || '',
    round_head_img: first.round_head_img || '',
    signature: first.signature || '',
    matched,
  };
}

export function startSearchAccountsTask(params: {
  keywords: string[];
  authKey: string;
  autoSave: boolean;
}): string {
  cleanupOldTasks();

  // 幂等：已有搜索任务在跑则复用
  const active = getActiveSearchAccountsTasks();
  if (active.length > 0) return active[0].id;

  const taskId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: SearchAccountsTask = {
    id: taskId,
    status: 'running',
    message: '开始批量搜索公众号...',
    total: params.keywords.length,
    done: 0,
    found: 0,
    saved: 0,
    results: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(taskId, task);

  void runSearchLoop(taskId, params);
  return taskId;
}

async function runSearchLoop(
  taskId: string,
  params: { keywords: string[]; authKey: string; autoSave: boolean }
) {
  const task = tasks.get(taskId);
  if (!task) return;

  const fail = (msg: string) => {
    task.status = 'failed';
    task.error = msg;
    task.message = `失败：${msg}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    log.error(`[search-accounts ${taskId}] 失败: ${msg}`);
  };

  const touch = (message?: string) => {
    if (message) task.message = message;
    task.updatedAt = Date.now();
  };

  try {
    // 取 token + cookie（用 authKey，不依赖 event）
    const token = await cookieStore.getToken(params.authKey);
    const cookie = await cookieStore.getCookie(params.authKey);

    if (!token) {
      fail('未登录或登录已过期，请重新扫码登录');
      return;
    }

    log.info(`[search-accounts ${taskId}] 开始搜索 ${params.keywords.length} 个关键词`);

    for (let i = 0; i < params.keywords.length; i++) {
      const keyword = params.keywords[i].trim();
      if (!keyword) {
        task.done++;
        continue;
      }

      touch(`正在搜索 ${i + 1}/${params.keywords.length}：${keyword}`);

      try {
        const result = await searchOneKeyword(keyword, token, cookie);
        task.results.push(result);
        task.done++;
        if (result.found) task.found++;

        // 自动入库
        if (result.found && result.fakeid && params.autoSave) {
          const now = Math.floor(Date.now() / 1000);
          const ok = await saveAccount({
            fakeid: result.fakeid,
            nickname: result.nickname || keyword,
            alias: result.alias || '',
            round_head_img: result.round_head_img || '',
            signature: result.signature || '',
            total_count: 0,
            synced_count: 0,
            create_time: now,
            update_time: now,
          });
          if (ok) task.saved++;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        task.results.push({ keyword, found: false });
        task.done++;
        if (msg === 'session expired') {
          fail(`搜索了 ${task.done} 个后 session 过期`);
          return;
        }
        log.warn(`[search-accounts ${taskId}] "${keyword}" 搜索失败: ${msg}`);
      }

      // 间隔防限流
      if (i < params.keywords.length - 1) {
        await sleep(INTERVAL_MS);
      }
    }

    // 完成
    task.status = 'completed';
    task.message = `完成：共搜 ${task.total} 个关键词，找到 ${task.found} 个公众号${params.autoSave ? `，入库 ${task.saved} 个` : ''}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    log.info(`[search-accounts ${taskId}] 完成，找到 ${task.found}/${task.total}`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
