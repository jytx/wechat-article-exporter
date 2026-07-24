/**
 * 用户数据访问层 (SQLite)
 */

import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

export interface User {
  id: number;
  username: string;
  password: string; // 存储哈希后的密码
  token: string;    // 用户的唯一 token
  created_at: number;
  updated_at: number;
}

/**
 * 初始化用户表
 */
export function initializeUserTable() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
  `);
}

/**
 * 根据 token 获取用户
 */
export function getUserByToken(token: string): User | null {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE token = ?');
    return stmt.get(token) as User | null;
  } catch (error) {
    log.error('getUserByToken failed:', error);
    return null;
  }
}

/**
 * 根据用户名获取用户
 */
export function getUserByUsername(username: string): User | null {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | null;
  } catch (error) {
    log.error('getUserByUsername failed:', error);
    return null;
  }
}

/**
 * 创建用户
 */
export function createUser(username: string, password: string, token: string): boolean {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO users (username, password, token)
      VALUES (?, ?, ?)
    `);
    stmt.run(username, password, token);
    return true;
  } catch (error) {
    log.error('createUser failed:', error);
    return false;
  }
}

/**
 * 更新用户的 token
 */
export function updateUserToken(userId: number, token: string): boolean {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE users
      SET token = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(token, userId);
    return true;
  } catch (error) {
    log.error('updateUserToken failed:', error);
    return false;
  }
}

/**
 * 获取所有用户
 */
export function getAllUsers(): User[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as User[];
  } catch (error) {
    log.error('getAllUsers failed:', error);
    return [];
  }
}
