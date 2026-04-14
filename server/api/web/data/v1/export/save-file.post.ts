/**
 * 保存导出文件到服务端
 * POST /api/web/data/v1/export/save-file
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { filename, content, type = 'base64', exportPath } = body;

    if (!filename) {
      throw createError({
        statusCode: 400,
        message: '文件名不能为空'
      });
    }

    // 解码内容
    let fileContent: Buffer;
    if (type === 'base64') {
      fileContent = Buffer.from(content, 'base64');
    } else if (type === 'utf8') {
      fileContent = Buffer.from(content, 'utf-8');
    } else {
      fileContent = Buffer.from(content);
    }

    // 确定导出路径
    const targetPath = exportPath || './exports';
    const fullPath = path.resolve(process.cwd(), targetPath);

    // 确保目录存在
    await fs.mkdir(fullPath, { recursive: true });

    // 写入文件
    const filePath = path.join(fullPath, filename);
    await fs.writeFile(filePath, fileContent);

    return {
      success: true,
      data: {
        path: filePath,
        size: fileContent.length
      }
    };

  } catch (error) {
    console.error('保存导出文件失败:', error);
    throw createError({
      statusCode: 500,
      message: `保存导出文件失败: ${error instanceof Error ? error.message : '未知错误'}`
    });
  }
});
