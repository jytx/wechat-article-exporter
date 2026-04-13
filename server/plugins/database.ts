/**
 * SQLite 数据库初始化插件
 */

import { getDatabase } from '~/server/utils/database';

export default defineNitroPlugin(() => {
  console.log('[@NitroPlugin] 初始化 SQLite 数据库...');

  // 预热数据库连接
  try {
    // 获取数据库连接会自动初始化表结构
    const db = getDatabase();

    console.log('[@NitroPlugin] SQLite 数据库初始化成功');
  } catch (error) {
    console.error('[@NitroPlugin] SQLite 数据库初始化失败:', error);
  }
});
