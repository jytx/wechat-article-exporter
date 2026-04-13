/**
 * 代理下载文章HTML
 * GET /api/proxy/article-html
 *
 * 通过服务器端转发请求，避免浏览器的 CORS 限制
 */

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const url = query.url as string;

  if (!url) {
    throw createError({
      statusCode: 400,
      message: '缺少 url 参数',
    });
  }

  try {
    // 从查询参数中获取 headers
    let headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://mp.weixin.qq.com/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    // 如果传递了自定义 headers（比如 cookie）
    if (query.headers) {
      try {
        const customHeaders = JSON.parse(query.headers as string);
        headers = { ...headers, ...customHeaders };
      } catch (e) {
        console.warn('解析 headers 失败:', e);
      }
    }

    // 服务器端转发请求
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: `请求失败: ${response.statusText}`,
      });
    }

    // 返回 HTML 内容
    const html = await response.text();

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('代理请求失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '代理请求失败',
    });
  }
});
