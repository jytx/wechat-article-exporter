/**
 * 标记文章为已下载
 * POST /api/skill/articles/downloaded
 */
import { markArticleAsDownloaded } from '~/server/database/article';
import { log } from '~/server/utils/log';

interface DownloadedBody {
  fakeid: string;
  aid: string;
  downloadedAt?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<DownloadedBody>(event);

    if (!body.fakeid || !body.aid) {
      throw createError({
        statusCode: 400,
        message: 'fakeid 和 aid 参数不能为空',
      });
    }

    // 构建主键: fakeid:aid
    const key = `${body.fakeid}:${body.aid}`;

    // 标记文章为已下载
    const downloadedAt = body.downloadedAt || new Date().toISOString();
    const success = await markArticleAsDownloaded(key, downloadedAt);

    if (!success) {
      throw createError({
        statusCode: 404,
        message: '文章不存在',
      });
    }

    return {
      success: true,
      message: '标记成功',
    };
  } catch (error) {
    log.error('Failed to mark article as downloaded:', error);
    throw error;
  }
});
