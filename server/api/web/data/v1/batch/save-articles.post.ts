/**
 * 批量保存文章
 * POST /api/web/data/v1/batch/save-articles
 */

import { getDatabase } from '~/server/utils/database';
import { getArticlesByFakeid, saveArticles } from '~/server/database/article';
import { updateAccountSyncedCount } from '~/server/database/account';
import { createApiError, ErrorCodes, successResponse, validateParams } from '~/server/utils/api-response';

interface ArticleInput {
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover?: string;
  author?: string;
  create_time?: number;
  datetime?: string;
  digest?: string;
  downloaded?: number;
  is_deleted?: number;
}

interface SaveArticlesBody {
  articles: ArticleInput[];
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SaveArticlesBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['articles']);

    if (!validation.valid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, `缺少必需参数: ${validation.missing?.join(', ')}`);
    }

    if (!Array.isArray(body.articles) || body.articles.length === 0) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'articles 必须是非空数组');
    }

    // 过滤掉已存在的文章，只保存新文章
    const fakeid = body.articles[0].fakeid;
    const db = getDatabase();

    // 获取已存在的文章 key 列表
    const existingKeysStmt = db.prepare(`
      SELECT key FROM articles WHERE fakeid = ?
    `);
    const existingKeys = new Set(
      existingKeysStmt.all(fakeid).map((row: any) => row.key)
    );

    // 过滤出新文章
    const newArticles = body.articles.filter(article => !existingKeys.has(article.key));

    if (newArticles.length === 0) {
      console.log(`[save-articles] 所有文章已存在，跳过保存。fakeid: ${fakeid}`);
      return successResponse(
        {
          saved: 0,
          skipped: body.articles.length,
          total: body.articles.length,
        },
        `所有文章已存在，跳过保存`
      );
    }

    console.log(`[save-articles] 新文章数: ${newArticles.length}, 总数: ${body.articles.length}, fakeid: ${fakeid}`);

    // 批量保存新文章
    const saved = await saveArticles(newArticles);

    // 更新公众号的同步文章数
    if (saved > 0) {
      try {
        // 获取该公众号的文章总数
        const result = await getArticlesByFakeid(fakeid);
        console.log(`[save-articles] fakeid: ${fakeid}, saved: ${saved}, result.total: ${result.total}`);
        // 更新同步文章数
        await updateAccountSyncedCount(fakeid, result.total);
      } catch (error) {
        console.error('更新公众号统计失败:', error);
        // 不影响主流程，只记录错误
      }
    }

    return successResponse(
      {
        saved,
        skipped: body.articles.length - newArticles.length,
        total: body.articles.length,
      },
      `成功保存 ${saved} 篇新文章，跳过 ${body.articles.length - newArticles.length} 篇已存在文章`
    );
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('批量保存文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '批量保存文章失败',
    });
  }
});
