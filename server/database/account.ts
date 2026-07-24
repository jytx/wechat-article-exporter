/**
 * 公众号数据访问层 (SQLite)
 */

import { getDatabase } from '~/server/utils/database';
import { log } from '~/server/utils/log';

export interface MpAccount {
  fakeid: string;
  nickname: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  total_count: number;
  synced_count: number;
  create_time: number;
  update_time: number;
}

/**
 * 保存公众号
 */
export async function saveAccount(account: MpAccount): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO accounts
      (fakeid, nickname, alias, round_head_img, signature, total_count, synced_count, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      account.fakeid,
      account.nickname,
      account.alias || null,
      account.round_head_img || null,
      account.signature || null,
      account.total_count,
      account.synced_count,
      account.create_time,
      account.update_time
    );

    return true;
  } catch (error) {
    log.error('saveAccount failed:', error);
    return false;
  }
}

/**
 * 获取单个公众号
 */
export async function getAccount(fakeid: string): Promise<MpAccount | null> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM accounts WHERE fakeid = ?');
    const row = stmt.get(fakeid) as any;
    return row || null;
  } catch (error) {
    log.error('getAccount failed:', error);
    return null;
  }
}

/**
 * 获取所有公众号
 */
export async function getAllAccounts(): Promise<MpAccount[]> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM accounts ORDER BY create_time DESC');
    return stmt.all() as MpAccount[];
  } catch (error) {
    log.error('getAllAccounts failed:', error);
    return [];
  }
}

/**
 * 分页获取公众号列表
 */
export async function getAccountsByPage(params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{
  items: MpAccount[];
  total: number;
}> {
  try {
    const db = getDatabase();
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    let countWhereClause = '';
    const queryParams: any[] = [];

    if (search) {
      whereClause = 'WHERE nickname LIKE ? OR alias LIKE ?';
      countWhereClause = 'WHERE nickname LIKE ? OR alias LIKE ?';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // 获取总数
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM accounts ${countWhereClause}`);
    const countResult = countStmt.get(...queryParams) as { count: number };
    const total = countResult.count;

    // 获取分页数据
    const dataStmt = db.prepare(`
      SELECT * FROM accounts
      ${whereClause}
      ORDER BY create_time DESC
      LIMIT ? OFFSET ?
    `);
    const items = dataStmt.all(...queryParams, pageSize, offset) as MpAccount[];

    return { items, total };
  } catch (error) {
    log.error('getAccountsByPage failed:', error);
    return { items: [], total: 0 };
  }
}

/**
 * 删除公众号
 */
export async function deleteAccount(fakeid: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM accounts WHERE fakeid = ?');
    stmt.run(fakeid);
    return true;
  } catch (error) {
    log.error('deleteAccount failed:', error);
    return false;
  }
}

/**
 * 批量删除公众号
 */
export async function deleteAccounts(fakeids: string[]): Promise<number> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM accounts WHERE fakeid = ?');

    let count = 0;
    const deleteMany = db.transaction((fakeidList: string[]) => {
      for (const fakeid of fakeidList) {
        stmt.run(fakeid);
        count++;
      }
    });

    deleteMany(fakeids);
    return count;
  } catch (error) {
    log.error('deleteAccounts failed:', error);
    return 0;
  }
}

/**
 * 更新公众号 total_count
 */
export async function updateAccountTotalCount(fakeid: string, totalCount: number): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE accounts
      SET total_count = ?, update_time = strftime('%s', 'now')
      WHERE fakeid = ?
    `);
    stmt.run(totalCount, fakeid);
    return true;
  } catch (error) {
    log.error('updateAccountTotalCount failed:', error);
    return false;
  }
}

/**
 * 更新公众号 synced_count
 */
export async function updateAccountSyncedCount(fakeid: string, count: number): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE accounts
      SET synced_count = ?, update_time = strftime('%s', 'now')
      WHERE fakeid = ?
    `);
    stmt.run(count, fakeid);
    return true;
  } catch (error) {
    log.error('updateAccountSyncedCount failed:', error);
    return false;
  }
}

/**
 * 检查公众号是否存在
 */
export async function accountExists(fakeid: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT 1 FROM accounts WHERE fakeid = ? LIMIT 1');
    const result = stmt.get(fakeid);
    return !!result;
  } catch (error) {
    log.error('accountExists failed:', error);
    return false;
  }
}
