/**
 * 服务器启动插件
 * 用于初始化和预热各种缓存
 */

import { warmupCookieStore } from '~/server/utils/warmup-cookie-store';

export default defineNitroPlugin(() => {
  console.log('[@NitroPlugin] 服务器启动，开始预热缓存...');

  // 预热 CookieStore
  warmupCookieStore().catch(err => {
    console.error('[@NitroPlugin] CookieStore 预热失败:', err);
  });
});
