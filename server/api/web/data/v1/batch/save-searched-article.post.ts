/**
 * 保存搜索到的文章（同时确保其所属公众号存在，否则文章在列表里查不出来）
 * POST /api/web/data/v1/batch/save-searched-article
 *
 * Body: {
 *   article: { key, fakeid, aid, title, link, ... },
 *   account?: { fakeid, nickname, round_head_img, ... }  // 公众号信息（搜索结果里有）
 * }
 *
 * 背景：articles.get 加载全部文章时遍历 accounts 表，
 * 若文章的 fakeid 不在 accounts 表里，该文章永远不会被查出来。
 * 所以搜索入库时必须同时确保公众号存在。
 */
import { saveAccount } from '~/server/database/account';
import { saveArticles, type Article } from '~/server/database/article';
import { successResponse, createApiError, ErrorCodes } from '~/server/utils/api-response';

interface SaveSearchedBody {
  article: Partial<Article> & { key: string; fakeid: string; aid: string; title: string; link: string };
  account?: { fakeid: string; nickname?: string; round_head_img?: string; alias?: string; signature?: string };
}

export default defineEventHandler(async event => {
  const body = await readBody<SaveSearchedBody>(event);
  if (!body?.article?.link) {
    throw createApiError(ErrorCodes.MISSING_PARAMETER, '缺少文章 link');
  }

  const now = Math.floor(Date.now() / 1000);
  const a = body.article;

  // 1. 先确保公众号存在（否则 articles.get 遍历 accounts 时查不到这篇文章）
  if (body.account?.fakeid) {
    // 如果搜索结果没返回头像，不覆盖已有的（避免把已有头像清空）
    let avatar = body.account.round_head_img || '';
    if (!avatar) {
      const { getAccount } = await import('~/server/database/account');
      const existing = await getAccount(body.account.fakeid);
      if (existing?.round_head_img) avatar = existing.round_head_img;
    }
    await saveAccount({
      fakeid: body.account.fakeid,
      nickname: body.account.nickname || '未知公众号',
      alias: body.account.alias || '',
      round_head_img: avatar,
      signature: body.account.signature || '',
      total_count: 0,
      synced_count: 0,
      create_time: now,
      update_time: now,
    }).catch(e => console.error('搜索入库时保存公众号失败:', e));
  }

  // 2. 保存文章
  const articleToSave: Article = {
    key: a.key,
    fakeid: a.fakeid,
    aid: a.aid,
    title: a.title,
    link: a.link,
    cover: a.cover || '',
    author: a.author || body.account?.nickname || '',
    digest: a.digest || '',
    create_time: a.create_time || null,
    update_time: a.create_time || null,
    datetime: a.datetime || '',
    downloaded: 0,
    is_deleted: 0,
    album_id: '',
    appmsg_album_infos: [],
  } as Article;

  const saved = await saveArticles([articleToSave]);

  return successResponse(
    { saved, article: articleToSave },
    saved > 0 ? '文章已入库' : '文章已存在'
  );
});
