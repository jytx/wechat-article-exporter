/**
 * 文章数据存储管理
 * 使用 Nuxt Storage (文件系统驱动)
 */

export interface ArticleKV {
  // 文章唯一标识 (fakeid:aid)
  key: string;
  // 公众号 ID
  fakeid: string;
  // 文章 ID
  aid: number;
  // 文章标题
  title: string;
  // 文章链接
  link: string;
  // 封面图
  cover: string;
  // 作者
  author?: string;
  // 创建时间（时间戳）
  create_time: number;
  // 发布日期字符串
  datetime?: string;
  // 是否已下载
  downloaded?: boolean;
  // 下载时间
  downloadedAt?: string;
  // 摘要
  digest?: string;
  // 是否被删除
  is_deleted?: boolean;
}

/**
 * 保存或更新文章
 */
export async function saveArticle(article: ArticleKV): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const key = `article:${article.key}`;
    await kv.set(key, article);
    return true;
  } catch (err) {
    console.error('saveArticle failed:', err);
    return false;
  }
}

/**
 * 批量保存文章
 */
export async function saveArticles(articles: ArticleKV[]): Promise<number> {
  const kv = useStorage('kv');
  let saved = 0;
  try {
    for (const article of articles) {
      const key = `article:${article.key}`;
      await kv.set(key, article);
      saved++;
    }
    return saved;
  } catch (err) {
    console.error('saveArticles failed:', err);
    return saved;
  }
}

/**
 * 获取文章
 */
export async function getArticle(key: string): Promise<ArticleKV | null> {
  const kv = useStorage('kv');
  try {
    return await kv.get<ArticleKV>(`article:${key}`);
  } catch (err) {
    console.error('getArticle failed:', err);
    return null;
  }
}

/**
 * 获取公众号的所有文章
 */
export async function getArticlesByFakeid(
  fakeid: string,
  begin: number = 0,
  size: number = 50
): Promise<{
  total: number;
  articles: ArticleKV[];
}> {
  const kv = useStorage('kv');
  try {
    // 获取所有文章 keys
    const keys = await kv.getKeys(`article:${fakeid}:`);

    const articles: ArticleKV[] = [];
    for (const key of keys) {
      const article = await kv.get<ArticleKV>(key);
      if (article && !article.is_deleted) {
        articles.push(article);
      }
    }

    // 按创建时间倒序排序
    articles.sort((a, b) => b.create_time - a.create_time);

    return {
      total: articles.length,
      articles: articles.slice(begin, begin + size),
    };
  } catch (err) {
    console.error('getArticlesByFakeid failed:', err);
    return { total: 0, articles: [] };
  }
}

/**
 * 获取公众号所有文章（不分页）
 */
export async function getAllArticlesByFakeid(fakeid: string): Promise<ArticleKV[]> {
  const kv = useStorage('kv');
  try {
    const keys = await kv.getKeys(`article:${fakeid}:`);

    const articles: ArticleKV[] = [];
    for (const key of keys) {
      const article = await kv.get<ArticleKV>(key);
      if (article && !article.is_deleted) {
        articles.push(article);
      }
    }

    // 按创建时间倒序排序
    return articles.sort((a, b) => b.create_time - a.create_time);
  } catch (err) {
    console.error('getAllArticlesByFakeid failed:', err);
    return [];
  }
}

/**
 * 获取未下载的文章
 */
export async function getUndownloadedArticles(fakeid: string): Promise<ArticleKV[]> {
  const articles = await getAllArticlesByFakeid(fakeid);
  return articles.filter(article => !article.downloaded);
}

/**
 * 标记文章为已下载
 */
export async function markArticleAsDownloaded(key: string, downloadedAt?: string): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const article = await kv.get<ArticleKV>(`article:${key}`);
    if (article) {
      article.downloaded = true;
      article.downloadedAt = downloadedAt || new Date().toISOString();
      await kv.set(`article:${key}`, article);
      return true;
    }
    return false;
  } catch (err) {
    console.error('markArticleAsDownloaded failed:', err);
    return false;
  }
}

/**
 * 删除公众号的所有文章
 */
export async function deleteArticlesByFakeid(fakeid: string): Promise<number> {
  const kv = useStorage('kv');
  try {
    const keys = await kv.getKeys(`article:${fakeid}:`);
    let deleted = 0;
    for (const key of keys) {
      await kv.remove(key);
      deleted++;
    }
    return deleted;
  } catch (err) {
    console.error('deleteArticlesByFakeid failed:', err);
    return 0;
  }
}

/**
 * 更新文章删除状态
 */
export async function updateArticleDeletedStatus(key: string, isDeleted: boolean): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const article = await kv.get<ArticleKV>(`article:${key}`);
    if (article) {
      article.is_deleted = isDeleted;
      await kv.set(`article:${key}`, article);
      return true;
    }
    return false;
  } catch (err) {
    console.error('updateArticleDeletedStatus failed:', err);
    return false;
  }
}
