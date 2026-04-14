/**
 * 保存文章 HTML 内容
 * POST /api/web/data/v1/html/save
 */

import { saveArticleHtml } from '~/server/database/html';
import { successResponse, createApiError, ErrorCodes, validateParams } from '~/server/utils/api-response';

interface SaveHtmlBody {
  url: string;
  fakeid: string;
  title: string;
  content: string;
  comment_id?: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<SaveHtmlBody>(event);

    // 验证必需参数
    const validation = validateParams(body, ['url', 'fakeid', 'title', 'content']);

    if (!validation.valid) {
      throw createApiError(ErrorCodes.MISSING_PARAMETER, `缺少必需参数: ${validation.missing?.join(', ')}`);
    }

    // 保存 HTML 内容
    const success = await saveArticleHtml({
      url: body.url,
      fakeid: body.fakeid,
      title: body.title,
      content: body.content,
      comment_id: body.comment_id,
    });

    if (!success) {
      throw createError({
        statusCode: 500,
        message: '保存文章内容失败',
      });
    }

    return successResponse(
      {
        url: body.url,
      },
      '文章内容保存成功'
    );
  } catch (error) {
    // 如果是已知的 API 错误，直接抛出
    if ((error as any).code) {
      throw error;
    }

    console.error('保存文章内容失败:', error);
    throw createError({
      statusCode: 500,
      message: '保存文章内容失败',
    });
  }
});
