/**
 * 获取公众号的合集列表
 * GET /api/web/data/v1/albums
 */

import { getAccount } from '~/server/database/account';
import { getDatabase } from '~/server/utils/database';
import { createApiError, ErrorCodes, successResponse } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;

    if (!fakeid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, '缺少 fakeid 参数');
    }

    // 检查公众号是否存在
    const account = await getAccount(fakeid);
    if (!account) {
      throw createApiError(ErrorCodes.ACCOUNT_NOT_FOUND);
    }

    // 从数据库获取该公众号的所有合集
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT appmsg_album_infos
      FROM articles
      WHERE fakeid = ?
        AND appmsg_album_infos IS NOT NULL
        AND appmsg_album_infos != '[]'
    `);

    const rows = stmt.all(fakeid) as any[];

    // 合并所有文章的合集信息并去重
    const albumsMap = new Map<string, any>();

    for (const row of rows) {
      let albums;
      try {
        albums = JSON.parse(row.appmsg_album_infos);
      } catch {
        continue;
      }

      if (Array.isArray(albums)) {
        for (const album of albums) {
          if (album.id && !albumsMap.has(album.id)) {
            albumsMap.set(album.id, {
              id: album.id,
              title: album.title,
              album_id: album.album_id
            });
          }
        }
      }
    }

    const albums = Array.from(albumsMap.values());

    return successResponse(albums, `获取到 ${albums.length} 个合集`);
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('获取合集列表失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取合集列表失败',
    });
  }
});
