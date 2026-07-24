/**
 * 文章摘要邮件正文生成器
 *
 * 纯函数：输入文章列表 + 日期范围，输出内联样式 HTML（邮件客户端兼容）。
 * 不依赖外部状态，不修改入参。
 */

import type { Article } from '~/server/database/article';

/** HTML 转义，防止文章标题/摘要里的特殊字符破坏邮件结构（纯函数） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 格式化秒级时间戳为中文日期（纯函数） */
function formatDate(seconds: number): string {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 按公众号分组的文章（纯函数，不修改入参） */
interface GroupedArticles {
  accountName: string;
  articles: Article[];
}

/** 将文章列表按公众号分组（纯函数） */
function groupByAccount(articles: Article[]): GroupedArticles[] {
  const map = new Map<string, Article[]>();
  for (const a of articles) {
    const name = a.account_nickname || '未知公众号';
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(a);
  }
  return Array.from(map.entries()).map(([accountName, arts]) => ({ accountName, articles: arts }));
}

/** 渲染单篇文章为 HTML（纯函数） */
function renderArticle(article: Article): string {
  const title = escapeHtml(article.title || '无标题');
  const link = escapeHtml(article.link || '#');
  const digest = article.digest ? escapeHtml(article.digest) : '';
  const time = article.create_time ? formatDate(article.create_time) : '';

  return `
    <div style="padding:14px 0;border-bottom:1px solid #f5f5f5;">
      <div style="font-size:16px;font-weight:600;margin-bottom:6px;">
        <a href="${link}" style="color:#222;text-decoration:none;">${title}</a>
      </div>
      <div style="font-size:12px;color:#999;margin-bottom:8px;">${time}</div>
      ${digest ? `<div style="font-size:14px;color:#555;line-height:1.7;">${digest}</div>` : ''}
    </div>`;
}

/** 渲染一个公众号分组的 HTML（纯函数） */
function renderGroup(group: GroupedArticles): string {
  return `
    <div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="font-size:18px;font-weight:600;color:#444;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;">
        ${escapeHtml(group.accountName)}
        <span style="background:#667eea;color:#fff;font-size:12px;padding:2px 10px;border-radius:10px;font-weight:400;margin-left:8px;">${group.articles.length} 篇</span>
      </div>
      ${group.articles.map(renderArticle).join('')}
    </div>`;
}

/**
 * 生成完整的 HTML 邮件正文（纯函数）。
 *
 * @param articles 文章列表（需带 account_nickname）
 * @param days     首次推送回溯天数（仅用于展示，不影响查询逻辑）
 * @returns 内联样式 HTML 字符串
 */
export function buildDigestHtml(articles: Article[], days: number): string {
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const groups = groupByAccount(articles);
  const accountCount = groups.length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#333;line-height:1.6;">
<div style="max-width:720px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:30px 20px;border-radius:12px;margin-bottom:24px;text-align:center;">
    <h1 style="font-size:24px;margin:0 0 8px 0;">📰 公众号文章速递</h1>
    <p style="opacity:0.85;font-size:14px;margin:0;">${dateStr} · 新增 ${articles.length} 篇文章 · ${accountCount} 个公众号</p>
  </div>
  ${groups.map(renderGroup).join('')}
  <div style="text-align:center;padding:20px;color:#aaa;font-size:12px;">
    由微信文章导出器自动发送
  </div>
</div>
</body>
</html>`;
}

/**
 * 生成纯文本邮件正文（webhook 用，纯函数）。
 * 格式：每行一篇，"公众号名 | 标题 | 链接"
 */
export function buildDigestText(articles: Article[]): string {
  const lines = articles.map(a => {
    const name = a.account_nickname || '未知';
    const title = a.title || '无标题';
    const link = a.link || '';
    return `${name} | ${title}\n${link}`;
  });
  return `公众号文章速递 · 共 ${articles.length} 篇\n\n${lines.join('\n\n')}`;
}
