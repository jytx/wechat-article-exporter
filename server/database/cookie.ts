/**
 * Cookie 数据访问层 (SQLite)
 * 兼容 CookieStore 接口
 */

import { getDatabase } from '~/server/utils/database';
import type { CookieEntity } from '~/server/utils/CookieStore';
import { log } from '~/server/utils/log';

export interface Cookie {
  auth_key: string;
  token: string;
  cookies: string;
  created_at?: number;
  updated_at?: number;
}

export type CookieKVKey = string;

export interface CookieKVValue {
  token: string;
  cookies: CookieEntity[];
}

/**
 * 保存 Cookie (兼容旧接口)
 */
export async function setMpCookie(key: CookieKVKey, data: CookieKVValue): Promise<boolean> {
  try {
    const db = getDatabase();

    // 序列化 cookies 数组为 JSON 字符串
    const cookiesJson = JSON.stringify(data.cookies);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cookies (auth_key, token, cookies, updated_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(key, data.token, cookiesJson);
    return true;
  } catch (error) {
    log.error('setMpCookie failed:', error);
    return false;
  }
}

/**
 * 获取 Cookie (兼容旧接口)
 */
export async function getMpCookie(key: CookieKVKey): Promise<CookieKVValue | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM cookies WHERE auth_key = ?');
    const row = stmt.get(key) as any;

    if (!row) {
      return null;
    }

    // 反序列化 cookies JSON 字符串为数组
    const cookies = JSON.parse(row.cookies);

    return {
      token: row.token,
      cookies: cookies,
    };
  } catch (error) {
    log.error('getMpCookie failed:', error);
    return null;
  }
}

/**
 * 保存 Cookie
 */
export async function saveCookie(cookie: Cookie): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cookies (auth_key, token, cookies, updated_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(cookie.auth_key, cookie.token, cookie.cookies);
    return true;
  } catch (error) {
    log.error('saveCookie failed:', error);
    return false;
  }
}

/**
 * 获取 Cookie
 */
export async function getCookie(authKey: string): Promise<Cookie | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM cookies WHERE auth_key = ?');
    const row = stmt.get(authKey) as any;
    return row || null;
  } catch (error) {
    log.error('getCookie failed:', error);
    return null;
  }
}

/**
 * 根据 token 获取 Cookie
 */
export async function getCookieByToken(token: string): Promise<Cookie | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM cookies WHERE token = ?');
    const row = stmt.get(token) as any;
    return row || null;
  } catch (error) {
    log.error('getCookieByToken failed:', error);
    return null;
  }
}

/**
 * 删除 Cookie
 */
export async function deleteCookie(authKey: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM cookies WHERE auth_key = ?');
    stmt.run(authKey);
    return true;
  } catch (error) {
    log.error('deleteCookie failed:', error);
    return false;
  }
}

/**
 * 获取所有 Cookies
 */
export async function getAllCookies(): Promise<Cookie[]> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM cookies ORDER BY updated_at DESC');
    return stmt.all() as Cookie[];
  } catch (error) {
    log.error('getAllCookies failed:', error);
    return [];
  }
}
