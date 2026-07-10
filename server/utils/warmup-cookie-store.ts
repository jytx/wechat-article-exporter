/**
 * CookieStore 预热
 * 在服务器启动时从 SQLite 数据库加载 cookie 数据到内存
 */

import type { CookieKVValue } from '~/server/database/cookie';
import { getAllCookies } from '~/server/database/cookie';
import { AccountCookie, cookieStore } from './CookieStore';

/**
 * 预热 CookieStore
 * 从 SQLite 数据库中加载所有 cookie 到内存 Map
 */
export async function warmupCookieStore(): Promise<void> {
  try {
    const cookies = await getAllCookies();

    console.log(`[CookieStore] 预热开始，找到 ${cookies.length} 个 cookie`);

    for (const row of cookies) {
      const authKey = row.auth_key;
      let data: CookieKVValue;

      try {
        // 反序列化 cookies JSON 字符串为数组
        const cookiesArray = JSON.parse(row.cookies);
        data = {
          token: row.token,
          cookies: cookiesArray,
        };
      } catch (error) {
        console.error(`[CookieStore] 解析 cookie 失败: ${authKey}`, error);
        continue;
      }

      if (data && data.token) {
        const accountCookie = AccountCookie.create(data.token, data.cookies || []);
        // 跳过已过期的 session：把过期 cookie 灌进内存，
        // 会因「内存优先」覆盖后续从 SQLite 读取的新 cookie，导致 session 过期问题。
        if (accountCookie.isExpired) {
          console.log(`[CookieStore] 预热跳过已过期的 cookie: ${authKey}`);
          continue;
        }
        cookieStore.store.set(authKey, accountCookie);
      }
    }

    console.log(`[CookieStore] 预热完成，加载了 ${cookieStore.store.size} 个 cookie 到内存`);
  } catch (error) {
    console.error('[CookieStore] 预热失败:', error);
  }
}
