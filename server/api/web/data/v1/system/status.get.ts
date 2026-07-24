/**
 * 获取系统状态
 * GET /api/web/data/v1/system/status
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getAllAccounts } from '~/server/database/account';
import { getAllArticlesByFakeid } from '~/server/database/article';
import { log } from '~/server/utils/log';

export default defineEventHandler(async event => {
  try {
    const kv = useStorage('kv');

    // 获取存储配置
    const storageConfig = {
      type: process.env.NITRO_KV_DRIVER || 'fs',
      path: process.env.NITRO_KV_BASE || '.data/kv',
    };

    // 统计数据量
    const accounts = await getAllAccounts();
    let articlesCount = 0;

    for (const account of accounts) {
      const articles = await getAllArticlesByFakeid(account.fakeid);
      articlesCount += articles.length;
    }

    // 获取存储大小（如果使用文件系统）
    let storageSize = 0;

    if (storageConfig.type === 'fs') {
      try {
        const kvPath = join(process.cwd(), storageConfig.path);

        // 检查目录是否存在
        try {
          await fs.access(kvPath);
        } catch {
          // 目录不存在，跳过存储大小计算
          storageSize = 0;
        }

        const files = await fs.readdir(kvPath, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = join(kvPath, file);
            const stats = await fs.stat(filePath);
            storageSize += stats.size;
          }
        }
      } catch (error) {
        log.error('获取存储大小失败:', error);
      }
    }

    return {
      success: true,
      data: {
        storage: {
          type: storageConfig.type,
          path: storageConfig.path,
          size: storageSize,
          size_formatted: formatBytes(storageSize),
          accounts_count: accounts.length,
          articles_count: articlesCount,
        },
        system: {
          node_version: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      },
    };
  } catch (error) {
    log.error('获取系统状态失败:', error);
    throw createError({
      statusCode: 500,
      message: '获取系统状态失败',
    });
  }
});

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
