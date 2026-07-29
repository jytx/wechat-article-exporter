/**
 * 获取文章列表
 * GET /api/web/data/v1/articles
 */

import { getAccount } from '~/server/database/account';
import { getAllArticles, getArticlesByFakeid } from '~/server/database/article';
import { createApiError, ErrorCodes, getPaginationParams, paginatedResponse } from '~/server/utils/api-response';
import { log } from '~/server/utils/log';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;

    // fakeid 现在是可选的，不传递则返回所有公众号的文章
    const { page, pageSize } = getPaginationParams(event);
    const status = (query.status as string) || 'all';
    const search = (query.search as string) || '';

    log.info(
      `[articles.get] 分页参数: page=${page}, pageSize=${pageSize}, fakeid=${fakeid || '全部'}, search="${search || ''}"`
    );

    let articles: any[] = [];
    let total = 0;

    // 特殊值：仅查公众号未入库的「孤儿」文章（从全网搜索添加但公众号未管理）
    // 前端公众号选择器的「未管理的文章」选项会传此 fakeid
    const UNMANAGED_FAKEID = '__unmanaged__';

    if (fakeid === UNMANAGED_FAKEID) {
      const result = await getAllArticles({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: search || undefined,
        accountManaged: true,
      });
      articles = result.items;
      total = result.total;
      log.info(`[articles.get] 未管理文章查询返回: ${articles.length} 条, 总数: ${total}`);
    } else if (fakeid) {
      // 检查公众号是否存在
      const account = await getAccount(fakeid);

      if (!account) {
        throw createApiError(ErrorCodes.ACCOUNT_NOT_FOUND);
      }

      // 获取指定公众号的文章列表
      const result = await getArticlesByFakeid(fakeid, {
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: search || undefined,
      });
      log.info(`[articles.get] 数据库返回: items.length=${result.items.length}, total=${result.total}`);
      if (result.items.length > 0) {
        log.info(`[articles.get] 第一篇文章数据:`, JSON.stringify(result.items[0], null, 2));
      }
      articles = result.items;
      total = result.total;
    } else {
      // 「全部」视图：直接查 articles 表（不依赖公众号是否入库），
      // 这样从全网搜索添加但公众号未入库的文章也能查出来。
      // 旧实现遍历 accounts 表，会导致公众号未入库的文章查不到。
      const result = await getAllArticles({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: search || undefined,
      });
      articles = result.items;
      total = result.total;
      log.info(`[articles.get] 全部文章查询返回: ${articles.length} 条, 总数: ${total}`);
    }

    // 解析 appmsg_album_infos JSON 字符串为数组
    articles = articles.map(article => {
      if (article.appmsg_album_infos && typeof article.appmsg_album_infos === 'string') {
        try {
          article.appmsg_album_infos = JSON.parse(article.appmsg_album_infos);
        } catch (e) {
          log.error('解析 appmsg_album_infos 失败:', e);
          article.appmsg_album_infos = [];
        }
      }
      return article;
    });

    // 根据状态过滤
    let filtered = articles;

    log.info(`[articles.get] 过滤前: ${articles.length} 条, total=${total}`);

    if (status === 'downloaded') {
      filtered = articles.filter(a => a.downloaded);
    } else if (status === 'undownloaded') {
      filtered = articles.filter(a => !a.downloaded && !a.is_deleted);
    } else if (status === 'deleted') {
      filtered = articles.filter(a => a.is_deleted);
    } else {
      filtered = articles.filter(a => !a.is_deleted);
    }

    log.info(
      `[articles.get] 过滤后: ${filtered.length} 条, 返回分页: page=${page}, pageSize=${pageSize}, total=${total}, totalPages=${Math.ceil(total / pageSize)}`
    );

    return paginatedResponse(filtered, total, page, pageSize);
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    log.error('获取文章列表失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取文章列表失败',
    });
  }
});
