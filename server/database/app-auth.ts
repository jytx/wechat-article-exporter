/**
 * 应用门禁数据访问层（单密码门禁）
 *
 * 设计说明：
 * - 复用 settings 表的 key-value 存储，不新建数据库表（KISS 原则）。
 * - 使用两个内部 key（双下划线前缀，刻意区别于普通业务设置，不会出现在设置页）：
 *     __app_credential：门禁凭证（派生值的 bcrypt 哈希）
 *     __app_sessions   ：有效会话 token 列表（支持主动吊销 / 改密失效）
 * - 所有函数均为纯数据读写，不包含密码哈希等业务逻辑（职责单一）。
 */

import { getSetting, setSetting } from '~/server/database/settings';
import { log } from '~/server/utils/log';

/** 门禁凭证（存储的是「传输派生值」的 bcrypt 哈希，非明文密码） */
export interface AppCredential {
  /** 传输派生值（SHA-256(密码+盐)）的 bcrypt 哈希 */
  hash: string;
  /** 是否仍为初始默认密码（首次登录后强制改密） */
  isInitial: boolean;
  /** 凭证最后更新时间（毫秒时间戳） */
  updatedAt: number;
}

/** 单个会话记录 */
export interface AppSession {
  /** 会话 token（随机 UUID，去横线） */
  token: string;
  /** 过期时间（毫秒时间戳） */
  expiresAt: number;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
}

/** 会话集合（存为 JSON 数组） */
interface AppSessionStore {
  sessions: AppSession[];
}

/** 内部存储 key */
const CREDENTIAL_KEY = '__app_credential';
const SESSIONS_KEY = '__app_sessions';

/** 默认会话有效期：30 天（毫秒） */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 读取门禁凭证
 * @returns 凭证对象；尚未初始化时返回 null
 */
export function getCredential(): AppCredential | null {
  try {
    const raw = getSetting(CREDENTIAL_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AppCredential;
  } catch (error) {
    log.error('读取门禁凭证失败:', error);
    return null;
  }
}

/**
 * 写入门禁凭证（全量覆盖）
 * 调用方需自行完成 bcrypt 哈希后再传入。
 */
export function saveCredential(credential: AppCredential): boolean {
  return setSetting(CREDENTIAL_KEY, JSON.stringify(credential));
}

/**
 * 读取全部会话（已自动清理过期项）
 */
export function getSessions(): AppSession[] {
  try {
    const raw = getSetting(SESSIONS_KEY);
    if (!raw) {
      return [];
    }
    const store = JSON.parse(raw) as AppSessionStore;
    return Array.isArray(store.sessions) ? store.sessions : [];
  } catch (error) {
    log.error('读取会话列表失败:', error);
    return [];
  }
}

/**
 * 持久化会话列表（全量覆盖）
 */
export function saveSessions(sessions: AppSession[]): boolean {
  const store: AppSessionStore = { sessions };
  return setSetting(SESSIONS_KEY, JSON.stringify(store));
}

/**
 * 新增一个会话 token
 * @returns 新建的会话记录
 */
export function addSession(token: string): AppSession {
  const now = Date.now();
  const session: AppSession = {
    token,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  };
  const sessions = pruneExpiredSessions(getSessions());
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

/**
 * 按 token 查找有效会话
 * @returns 命中且未过期则返回该会话，否则 null
 */
export function findSession(token: string): AppSession | null {
  const sessions = pruneExpiredSessions(getSessions());
  const hit = sessions.find(s => s.token === token);
  return hit ?? null;
}

/**
 * 删除指定 token 的会话（登出用）
 */
export function removeSession(token: string): void {
  const sessions = pruneExpiredSessions(getSessions()).filter(s => s.token !== token);
  saveSessions(sessions);
}

/**
 * 清空全部会话（改密后强制所有设备重新登录用）
 */
export function clearAllSessions(): void {
  saveSessions([]);
}

/**
 * 清理已过期的会话，并把清理后的结果持久化
 * @returns 仍有效的会话列表
 */
function pruneExpiredSessions(sessions: AppSession[]): AppSession[] {
  const now = Date.now();
  const alive = sessions.filter(s => s.expiresAt > now);
  // 有过期项被剔除时才写回，避免无谓 IO
  if (alive.length !== sessions.length) {
    saveSessions(alive);
  }
  return alive;
}
