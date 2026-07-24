/**
 * 批量同步文章
 * POST /api/web/data/v1/batch/sync-articles
 */

import { getAccount, updateAccountSyncedCount, updateAccountTotalCount } from '~/server/database/account';
import { getArticlesByFakeid, saveArticles } from '~/server/database/article';
import { createApiError, ErrorCodes, successResponse, validateParams } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

interface SyncArticlesBody {
  fakeid: string;
  begin?: number;
  size?: number;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SyncArticlesBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['fakeid']);

    if (!validation.valid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, `缺少必需参数: ${validation.missing?.join(', ')}`);
    }

    const begin = body.begin || 0;
    const size = Math.min(100, body.size || 20); // 最多一次同步 100 篇

    // 调用现有的文章同步 API
    // 这里使用内部 fetch，因为都是同一个服务器
    const articleApiUrl = `http://localhost:3000/api/public/v1/article?fakeid=${body.fakeid}&begin=${begin}&size=${size}`;

    const response = await fetch(articleApiUrl, {
      headers: {
        // 继承客户端的 headers（包括 cookie）
        Cookie: getRequestHeader(event, 'cookie') || '',
      },
    });

    if (!response.ok) {
      throw createApiError(ErrorCodes.SERVICE_UNAVAILABLE, '获取文章列表失败');
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
              album_id: article.album_id || null,
              appmsg_album_infos: article.appmsg_album_infos || [],
              downloaded: false,
              is_deleted: false,
            });
          }
        }
      }
    }

    // 批量保存文章
    const saved = await saveArticles(articles);

    // 更新公众号统计信息
    const totalCount = data.publish_page?.total_count || 0;

    // 更新 total_count（文章总数，来自微信 API）
    if (begin === 0 && totalCount > 0) {
      await updateAccountTotalCount(body.fakeid, totalCount);
    }

    // 更新 synced_count（已同步到本地的文章数量）
    const localArticles = await getArticlesByFakeid(body.fakeid);
    await updateAccountSyncedCount(body.fakeid, localArticles.total);

    return successResponse(
      {
        fakeid: body.fakeid,
        saved,
        total: data.publish_page?.total_count || 0,
        has_more: begin + size < (data.publish_page?.total_count || 0),
      },
      `同步完成: ${saved} 篇文章`
    );
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('批量同步文章失败:', error);
    throw createError({
      statusCode: 500,
      message: '批量同步文章失败',
    });
  }
});
