/**
 * 文章正文批量补抓任务（后台 fire-and-forget，照抄 sync-task-manager 模式）
 *
 * 流程：查最近 N 天无正文的文章 → 逐篇【服务端直连 fetch 微信】→ cheerio 提取纯文本 → 存 article_content → sleep 限流
 *
 * 关键：经实测，服务端直接 fetch 微信文章 URL（带浏览器 UA + Referer）返回 200，无需代理。
 * 不依赖微信登录态（正文是公开网页）。单篇失败跳过不阻断，429/403 退避。
 */

import * as cheerio from 'cheerio';
import { getArticlesMissingContent, upsertContent } from '~/server/database/article-content';

export interface ContentFetchTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  phase: 'querying' | 'fetching' | 'done';
  message: string;
  total: number;
  done: number;
  failed: number;
  days: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
}

const tasks = new Map<string, ContentFetchTask>();
const TASK_TTL_MS = 60 * 60 * 1000; // 补抓可能较久，保留 1 小时

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

export function getContentFetchTask(taskId: string): ContentFetchTask | undefined {
  cleanupOldTasks();
  return tasks.get(taskId);
}

export function getActiveContentFetchTasks(): ContentFetchTask[] {
  cleanupOldTasks();
  return Array.from(tasks.values()).filter(t => t.status === 'running' || t.status === 'pending');
}

// 浏览器级请求头（经实测这套头服务端直连能拿到 200）
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://mp.weixin.qq.com/',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const FETCH_TIMEOUT_MS = 20000;
const INTERVAL_MS = 1000; // 正常间隔（微信对频率敏感，不要太快）
const RATE_LIMIT_SLEEP_MS = 8000; // 触发限流时退避
const MAX_CONSECUTIVE_FAIL = 8; // 连续失败 N 次提前终止
const MAX_CONTENT_CHARS = 8000;

/**
 * 从原始 HTML 提取纯文本正文（微信容器 #js_content / .rich_media_content，兜底 body）
 */
function extractText(html: string): string {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const raw = $('#js_content').text() || $('.rich_media_content').text() || $('body').text() || '';
    const text = raw.replace(/\s+/g, ' ').trim();
    return text.length > MAX_CONTENT_CHARS ? `${text.slice(0, MAX_CONTENT_CHARS)}…` : text;
  } catch (error) {
    console.error('extractText failed:', error);
    return '';
  }
}

/**
 * 服务端直连抓取单篇文章 HTML（不走代理端点，直接 fetch 微信 URL）
 */
async function fetchOne(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const text = extractText(html);
    if (text.length <= 50) throw new Error('正文为空或过短');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function startContentFetchTask(days: number, limit: number): string {
  cleanupOldTasks();

  const active = getActiveContentFetchTasks();
  if (active.length > 0) return active[0].id;

  const taskId = `content_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: ContentFetchTask = {
    id: taskId,
    status: 'running',
    phase: 'querying',
    message: '正在查询待补抓的文章...',
    total: 0,
    done: 0,
    failed: 0,
    days,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(taskId, task);

  void runContentFetchLoop(taskId, days, limit);
  return taskId;
}

async function runContentFetchLoop(taskId: string, days: number, limit: number) {
  const task = tasks.get(taskId);
  if (!task) return;

  const fail = (msg: string) => {
    task.status = 'failed';
    task.error = msg;
    task.message = `失败：${msg}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    console.error(`[content-fetch ${taskId}] 失败: ${msg}`);
  };

  const touch = (message?: string) => {
    if (message) task.message = message;
    task.updatedAt = Date.now();
  };

  try {
    // 1. 查待补抓文章
    task.phase = 'querying';
    touch('正在查询待补抓的文章...');
    const articles = await getArticlesMissingContent(days, limit);
    task.total = articles.length;

    if (articles.length === 0) {
      task.status = 'completed';
      task.phase = 'done';
      task.message = '所选范围内正文已齐全，无需补抓';
      task.finishedAt = Date.now();
      task.updatedAt = Date.now();
      return;
    }

    touch(`共 ${articles.length} 篇待补抓，开始抓取（服务端直连）...`);
    console.log(`[content-fetch ${taskId}] 开始补抓 ${articles.length} 篇正文（直连模式）`);

    // 2. 逐篇抓取
    task.phase = 'fetching';
    let consecutiveFail = 0;

    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      const progress = `${i + 1}/${articles.length}`;
      touch(`正在抓取 ${progress}：${(a.title || '').slice(0, 30)}`);

      try {
        const text = await fetchOne(a.url);
        const ok = await upsertContent({ url: a.url, fakeid: a.fakeid, title: a.title, content: text });
        if (ok) {
          task.done++;
          consecutiveFail = 0;
        } else {
          task.failed++;
          consecutiveFail++;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        task.failed++;
        consecutiveFail++;
        if (msg.includes('403') || msg.includes('429') || msg.includes('401')) {
          console.warn(`[content-fetch ${taskId}] ${progress} 被限流(${msg})，退避 ${RATE_LIMIT_SLEEP_MS}ms`);
          await new Promise(r => setTimeout(r, RATE_LIMIT_SLEEP_MS));
        } else {
          console.warn(`[content-fetch ${taskId}] ${progress} 失败: ${msg}`);
        }
      }

      // 连续失败过多，提前终止（可能 IP 被临时封）
      if (consecutiveFail >= MAX_CONSECUTIVE_FAIL) {
        touch(`连续 ${consecutiveFail} 次失败，提前终止（已成功 ${task.done}/${task.total}）`);
        break;
      }

      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }

    // 3. 完成
    task.status = 'completed';
    task.phase = 'done';
    const failedHint = task.failed > 0 ? `，${task.failed} 篇失败` : '';
    task.message = `完成：成功补抓 ${task.done} 篇正文${failedHint}`;
    task.finishedAt = Date.now();
    task.updatedAt = Date.now();
    console.log(`[content-fetch ${taskId}] 完成，成功 ${task.done}，失败 ${task.failed}`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
