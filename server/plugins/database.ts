/**
 * SQLite 数据库初始化插件
 */

import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

export default defineNitroPlugin(() => {
  log.info('[@NitroPlugin] 初始化 SQLite 数据库...');

  // 预热数据库连接
  try {
    // 获取数据库连接会自动初始化表结构
    const db = getDatabase();

    log.info('[@NitroPlugin] SQLite 数据库初始化成功');
  } catch (error) {
    log.error('[@NitroPlugin] SQLite 数据库初始化失败:', error);
  }
});
