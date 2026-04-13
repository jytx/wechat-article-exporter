/**
 * 导出公众号数据
 * GET /api/web/data/v1/batch/export-accounts
 */

import { getAllAccounts } from '~/server/database/account';
import { getAllArticlesByFakeid } from '~/server/database/article';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const includeArticles = query.include_articles === 'true';

    // 获取所有公众号
    const accounts = await getAllAccounts();

    const exportData = {
      version: '1.0',
      export_time: new Date().toISOString(),
      data: {
        accounts: []
      } as {
        accounts: any[];
        articles?: any[];
      }
    };

    // 导出公众号数据
    for (const account of accounts) {
      exportData.data.accounts.push({
        fakeid: account.fakeid,
        nickname: account.nickname,
        alias: account.alias,
        round_head_img: account.round_head_img,
        signature: account.signature,
        total_count: account.total_count,
        synced_count: account.synced_count,
        create_time: account.create_time,
        update_time: account.update_time
      });
    }

    // 如果需要包含文章
    if (includeArticles) {
      exportData.data.articles = [];

      for (const account of accounts) {
        const articles = await getAllArticlesByFakeid(account.fakeid);

        for (const article of articles) {
          exportData.data.articles.push({
            key: article.key,
            fakeid: article.fakeid,
            aid: article.aid,
            title: article.title,
            link: article.link,
            cover: article.cover,
            author: article.author,
            create_time: article.create_time,
            datetime: article.datetime,
            digest: article.digest,
            downloaded: article.downloaded,
            downloadedAt: article.downloadedAt,
            is_deleted: article.is_deleted
          });
        }
      }
    }

    // 设置响应头，触发文件下载
    setHeader(event, 'content-type', 'application/json');
    setHeader(event, 'content-disposition', `attachment; filename="wechat-exporter-export-${Date.now()}.json"`);

    return exportData;

  } catch (error) {
    console.error('导出公众号数据失败:', error);
    throw createError({
      statusCode: 500,
      message: '导出公众号数据失败'
    });
  }
});
