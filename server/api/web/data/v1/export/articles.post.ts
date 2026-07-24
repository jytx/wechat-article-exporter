/**
 * 导出文章到服务端指定路径
 * POST /api/web/data/v1/export/articles
 */

import { promises as fs } from 'fs';
import { createError } from 'h3';
import path from 'path';
import { log } from '~/server/utils/log';

interface ExportArticleItem {
  url: string;
  title: string;
  fakeid: string;
  accountName: string;
  content: string;
}

interface ExportRequest {
  articles: ExportArticleItem[];
  format: 'markdown' | 'html' | 'txt';
  exportPath: string;
}

export default defineEventHandler(async event => {
  try {
    log.info('开始处理导出请求...');

    // 读取请求体
    let body: ExportRequest;
    try {
      body = await readBody<ExportRequest>(event);
      log.info('请求体:', JSON.stringify(body, null, 2));
    } catch (readError) {
      log.error('读取请求体失败:', readError);
      throw createError({
        statusCode: 400,
        message: `请求体格式错误: ${readError instanceof Error ? readError.message : '未知错误'}`,
      });
    }

    const { articles, format, exportPath } = body;

    log.info('解析后的参数 - articles 数量:', articles?.length, 'format:', format, 'exportPath:', exportPath);

    if (!articles || articles.length === 0) {
      throw createError({
        statusCode: 400,
        message: '没有要导出的文章',
      });
    }

    if (!exportPath) {
      throw createError({
        statusCode: 400,
        message: '请先设置导出路径',
      });
    }

    // 确定导出路径（支持相对路径和绝对路径）
    const targetPath = path.resolve(process.cwd(), exportPath);

    // 创建导出目录
    await fs.mkdir(targetPath, { recursive: true });

    const results = [];

    // 导出每篇文章
    for (const article of articles) {
      try {
        log.info('开始处理文章:', JSON.stringify(article, null, 2));

        // 验证并获取公众号名称和标题（提供默认值）
        const accountName = article.accountName || '未知公众号';
        const title = article.title || `untitled_${Date.now()}`;

        log.info('accountName:', accountName, 'title:', title);

        // 创建公众号子目录
        const sanitizedAccountName = filterInvalidFilenameChars(String(accountName));
        log.info('sanitizedAccountName:', sanitizedAccountName);
        log.info('targetPath:', targetPath);

        const accountDir = path.join(targetPath, sanitizedAccountName);
        log.info('accountDir:', accountDir);

        await fs.mkdir(accountDir, { recursive: true });

        // 生成文件名
        const sanitizedTitle = filterInvalidFilenameChars(String(title));
        log.info('sanitizedTitle:', sanitizedTitle);
        const filename = sanitizedTitle;
        let filePath: string;
        let content: string;

        switch (format) {
          case 'markdown':
            filePath = path.join(accountDir, `${filename}.md`);
            content = article.content; // 假设传入的内容已经是 Markdown 格式
            break;
          case 'html':
            filePath = path.join(accountDir, `${filename}.html`);
            content = article.content; // 假设传入的内容已经是 HTML 格式
            break;
          case 'txt':
            filePath = path.join(accountDir, `${filename}.txt`);
            content = article.content; // 假设传入的内容已经是纯文本格式
            break;
          default:
            throw new Error(`不支持的导出格式: ${format}`);
        }

        // 写入文件
        await fs.writeFile(filePath, content, 'utf-8');

        results.push({
          url: article.url,
          title: article.title,
          success: true,
          path: filePath,
        });
      } catch (error) {
        log.error(`导出文章失败: ${article.title}`, error);
        results.push({
          url: article.url,
          title: article.title,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    return {
      success: true,
      data: {
        total: articles.length,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
        results,
      },
    };
  } catch (error) {
    log.error('导出文章失败:', error);
    throw createError({
      statusCode: 500,
      message: `导出文章失败: ${error instanceof Error ? error.message : '未知错误'}`,
    });
  }
});

/**
 * 过滤文件名中的非法字符
 */
function filterInvalidFilenameChars(filename: string): string {
  return filename.replace(/[\/\\?%*:|"<>]/g, '_');
}
