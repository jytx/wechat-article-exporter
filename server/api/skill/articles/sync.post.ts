/**
 * 同步文章列表并保存到服务器存储
 * POST /api/skill/articles/sync
 *
 * Body: { fakeid: string, begin?: number, size?: number }
 */

import { updateAccountSyncedCount } from '~/server/database/account';
import { saveArticles } from '~/server/database/article';

interface SyncArticlesBody {
  fakeid: string;
  begin?: number;
  size?: number;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SyncArticlesBody>(event);

    if (!body.fakeid) {
      throw createError({
        statusCode: 400,
        message: 'fakeid 参数不能为空',
      });
    }

    const begin = body.begin || 0;
    const size = body.size || 20;

    // 调用内部文章 API 获取数据
    // 这里需要调用现有的微信 API
    const articleApiUrl = `http://localhost:3000/api/public/v1/article?fakeid=${body.fakeid}&begin=${begin}&size=${size}`;

    const response = await fetch(articleApiUrl);
    if (!response.ok) {
      throw createError({
        statusCode: 500,
        message: '获取文章列表失败',
      });
    }

    const data = await response.json();

    // 转换数据格式并保存
    const articles = [];
    if (data.base_resp?.ret === 0 && data.publish_page?.publish_list) {
      for (const item of data.publish_page.publish_list) {
        if (item.publish_info) {
          const publishInfo = JSON.parse(item.publish_info);
          for (const article of publishInfo.appmsgex) {
            articles.push({
              key: `${body.fakeid}:${article.aid}`,
              fakeid: body.fakeid,
              aid: article.aid,
              title: article.title,
              link: article.link,
              cover: article.cover,
              author: article.author,
              create_time: article.create_time,
              update_time: article.update_time,
              datetime: article.datetime,
              digest: article.digest,
              downloaded: false,
            });
          }
        }
      }
    }

    // 批量保存文章
    const saved = await saveArticles(articles);

    // 更新公众号同步数量
    await updateAccountSyncedCount(body.fakeid, saved);

    return {
      success: true,
      data: {
        saved,
        total: data.publish_page?.total_count || 0,
      },
    };
  } catch (error) {
    console.error('Failed to sync articles:', error);
    throw error;
  }
});
