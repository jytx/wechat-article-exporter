/**
 * 文章内容（HTML）服务端 API 工具函数
 * 替代 IndexedDB 的 HTML 缓存
 */

export interface ArticleHtmlAsset {
  url: string;
  fakeid: string;
  title: string;
  content: string;
  comment_id?: string;
  downloaded_at?: number;
}

/**
 * 保存文章 HTML 内容到服务端
 * @param html HTML 内容对象
 * @returns 是否保存成功
 */
export async function saveArticleHtmlToServer(html: ArticleHtmlAsset): Promise<boolean> {
  try {
    const response = await fetch('/api/web/data/v1/html/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(html),
    });

    if (!response.ok) {
      console.error('保存文章内容失败:', response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('saveArticleHtmlToServer 失败:', error);
    return false;
  }
}

/**
 * 从服务端获取文章 HTML 内容
 * @param url 文章链接
 * @returns HTML 内容对象，如果不存在则返回 null
 */
export async function getArticleHtmlFromServer(url: string): Promise<ArticleHtmlAsset | null> {
  try {
    const response = await fetch(`/api/web/data/v1/html/get?url=${encodeURIComponent(url)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('获取文章内容失败:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data.exists) {
      return data.data.data;
    }
    return null;
  } catch (error) {
    console.error('getArticleHtmlFromServer 失败:', error);
    return null;
  }
}

/**
 * 检查文章 HTML 是否已下载
 * @param url 文章链接
 * @returns 是否已下载
 */
export async function isArticleHtmlDownloadedOnServer(url: string): Promise<boolean> {
  const html = await getArticleHtmlFromServer(url);
  return html !== null;
}
