/**
 * 文章预览：实时 fetch 微信文章 → 提取正文 HTML → 返回可渲染的片段。
 *
 * 用于搜索结果的 iframe srcdoc 预览（srcdoc 不受 CSP frame-ancestors 限制）。
 * 不依赖数据库，不需要预先下载文章内容。
 *
 * GET /api/web/data/v1/topic/preview-html?url=xxx
 */
import * as cheerio from 'cheerio';
import { successResponse } from '~/server/utils/api-response';

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://mp.weixin.qq.com/',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const url = query.url as string;

  if (!url || !url.includes('mp.weixin.qq.com')) {
    return successResponse({ html: '', error: '无效的微信文章 URL' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: REQUEST_HEADERS,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return successResponse({ html: '', error: `抓取失败: HTTP ${res.status}` });
    }

    const rawHtml = await res.text();
    const $ = cheerio.load(rawHtml);

    // 提取标题
    const title = $('#activity-name').text().trim() || $('h1').first().text().trim() || '';
    // 提取公众号名
    const author = $('#js_name').text().trim() || '';
    // 提取发布时间
    const pubTime = $('#publish_time').text().trim() || '';
    // 提取正文区域
    const contentHtml = $('#js_content').html() || $('.rich_media_content').html() || '';

    if (!contentHtml) {
      return successResponse({ html: '', error: '未能提取到正文内容' });
    }

    // 处理图片：把 data-src 转成 src（微信懒加载机制）
    $('#js_content img, .rich_media_content img').each((_, img) => {
      const dataSrc = $(img).attr('data-src') || $(img).attr('data-original');
      if (dataSrc && !$(img).attr('src')) {
        $(img).attr('src', dataSrc);
      }
    });
    const processedContent = $('#js_content').html() || $('.rich_media_content').html() || contentHtml;

    // 拼装完整的可预览 HTML（带微信风格的样式）
    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; margin: 0; padding: 20px; color: #333; background: #fff; line-height: 1.75; font-size: 16px; }
  .preview-header { border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px; }
  .preview-title { font-size: 22px; font-weight: 600; color: #222; margin: 0 0 8px; line-height: 1.4; }
  .preview-meta { font-size: 13px; color: #999; }
  .preview-meta span { margin-right: 12px; }
  img { max-width: 100% !important; height: auto !important; }
  section, p { max-width: 100% !important; }
  #js_content, .rich_media_content { font-size: 16px; }
  #js_content img, .rich_media_content img { border-radius: 4px; }
  pre, code { background: #f6f8fa; border-radius: 3px; }
  pre { padding: 12px; overflow-x: auto; }
  code { padding: 2px 6px; }
  blockquote { border-left: 3px solid #ddd; margin: 0; padding: 4px 16px; color: #666; }
</style>
</head>
<body>
  <div class="preview-header">
    <h1 class="preview-title">${escapeHtml(title)}</h1>
    <div class="preview-meta">
      ${author ? `<span>公众号：${escapeHtml(author)}</span>` : ''}
      ${pubTime ? `<span>${escapeHtml(pubTime)}</span>` : ''}
    </div>
  </div>
  <div id="js_content">${processedContent}</div>
</body>
</html>`;

    return successResponse({ html: fullHtml });
  } catch (error: any) {
    console.error('[preview-html] 抓取失败:', error?.message);
    return successResponse({ html: '', error: error?.message || '预览失败' });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
