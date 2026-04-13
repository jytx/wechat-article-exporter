/**
 * 导入数据到后端存储
 * POST /api/web/data/v1/migration/import
 */

import { saveAccount } from '~/server/database/account';
import { saveArticles } from '~/server/database/article';
import { successResponse, validateParams, ErrorCodes, createApiError } from '~/server/utils/api-response';

interface ImportDataBody {
  accounts: Array<{
    fakeid: string;
    nickname?: string;
    alias?: string;
    round_head_img?: string;
    signature?: string;
    total_count?: number;
    synced_count?: number;
  }>;
  articles?: Array<{
    key: string;
    fakeid: string;
    aid: number;
    title: string;
    link: string;
    cover?: string;
    author?: string;
    create_time: number;
    datetime?: string;
    digest?: string;
    downloaded?: boolean;
    downloadedAt?: string;
    is_deleted?: boolean;
  }>;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ImportDataBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['accounts']);

    if (!validation.valid) {
      throw createApiError(
        ErrorCodes.MISSING_PARAMETER,
        `缺少必需参数: ${validation.missing?.join(', ')}`
      );
    }

    if (!Array.isArray(body.accounts)) {
      throw createApiError(ErrorCodes.INVALID_PARAMETER, 'accounts 必须是数组');
    }

    let accountsImported = 0;
    let articlesImported = 0;
    const errors: string[] = [];

    // 导入公众号
    for (const account of body.accounts) {
      try {
        if (!account.fakeid) {
          errors.push(`跳过无效公众号: fakeid 为空`);
          continue;
        }

        const accountData = {
          fakeid: account.fakeid,
          nickname: account.nickname || '',
          alias: account.alias,
          round_head_img: account.round_head_img,
          signature: account.signature,
          total_count: account.total_count || 0,
          synced_count: account.synced_count || 0,
          create_time: Math.round(Date.now() / 1000),
          update_time: Math.round(Date.now() / 1000)
        };

        await saveAccount(accountData);
        accountsImported++;

      } catch (error) {
        console.error(`导入公众号失败 [${account.fakeid}]:`, error);
        errors.push(`导入公众号失败 [${account.fakeid}]: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    // 导入文章（如果有）
    if (body.articles && Array.isArray(body.articles)) {
      // 分批导入，每批 100 篇
      const BATCH_SIZE = 100;

      for (let i = 0; i < body.articles.length; i += BATCH_SIZE) {
        const batch = body.articles.slice(i, i + BATCH_SIZE);

        try {
          const saved = await saveArticles(batch);
          articlesImported += saved;
        } catch (error) {
          console.error(`批量导入文章失败 [${i}]:`, error);
          errors.push(`批量导入文章失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }
    }

    return successResponse({
      accounts_imported: accountsImported,
      articles_imported: articlesImported,
      errors: errors.slice(0, 10) // 最多返回 10 个错误
    }, `导入完成: ${accountsImported} 个公众号, ${articlesImported} 篇文章`);

  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('导入数据失败:', error);
    throw createError({
      statusCode: 500,
      message: '导入数据失败'
    });
  }
});
