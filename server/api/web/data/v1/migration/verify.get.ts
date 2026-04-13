/**
 * 验证迁移数据
 * GET /api/web/data/v1/migration/verify
 */

import { getAllAccounts } from '~/server/database/account';
import { getAllArticlesByFakeid } from '~/server/database/article';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const indexeddbAccounts = Number(query.indexeddb_accounts || 0);
    const indexeddbArticles = Number(query.indexeddb_articles || 0);

    // 获取后端数据量
    const accounts = await getAllAccounts();
    const backendAccounts = accounts.length;

    let backendArticles = 0;

    for (const account of accounts) {
      const articles = await getAllArticlesByFakeid(account.fakeid);
      backendArticles += articles.length;
    }

    // 对比数据
    const accountsMatch = indexeddbAccounts === backendAccounts;
    const articlesMatch = indexeddbArticles === backendArticles;

    return {
      success: true,
      data: {
        accounts_match: accountsMatch,
        articles_match: articlesMatch,
        indexeddb: {
          accounts: indexeddbAccounts,
          articles: indexeddbArticles
        },
        backend: {
          accounts: backendAccounts,
          articles: backendArticles
        },
        diff: {
          accounts: backendAccounts - indexeddbAccounts,
          articles: backendArticles - indexeddbArticles
        }
      }
    };

  } catch (error) {
    console.error('验证数据失败:', error);
    throw createError({
      statusCode: 500,
      message: '验证数据失败'
    });
  }
});
