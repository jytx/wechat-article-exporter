/**
 * 应用门禁业务工具层
 *
 * 职责：密码哈希/校验、会话 cookie 下发与清除、密码强度校验、登录失败锁定。
 * 与数据读写（database/app-auth.ts）解耦，本层只做「业务规则 + 安全」。
 *
 * 安全要点：
 * 1. 网络传输的是「传输派生值」SHA-256(密码 + 应用固定盐)，不是原始明文密码。
 * 2. 本层对该派生值再做 bcrypt 慢哈希后存储，数据库泄漏也无法反推密码。
 */

import {
  clearAllSessions,
  getCredential,
  saveCredential,
  SESSION_MAX_AGE_MS,
} from '~/server/database/app-auth';
import { APP_PEPPER } from '~/utils/password';

// 重新导出，供服务端其它模块（如初始化插件）就近引用，避免跨层引用混乱
export { APP_PEPPER };

/** app_token cookie 名称 */
export const APP_TOKEN_COOKIE = 'app_token';

/**
 * 对「传输派生值」做 bcrypt 哈希
 */
export async function hashDerived(derived: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(derived, 10);
}

/**
 * 校验「传输派生值」是否匹配已存储的 bcrypt 哈希
 */
export async function verifyDerived(
  derived: string,
  hashed: string,
): Promise<boolean> {
  try {
    const bcrypt = await import('bcrypt');
    return await bcrypt.compare(derived, hashed);
  } catch (error) {
    log.error('门禁密码校验失败:', error);
    return false;
  }
}

/**
 * 下发 30 天有效的 app_token cookie（httpOnly，防 XSS 读取）
 */
export function setAppTokenCookie(
  event: H3Event<EventType>,
  token: string,
): void {
  setCookie(event, APP_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

/**
 * 清除 app_token cookie
 */
export function clearAppTokenCookie(event: H3Event<EventType>): void {
  deleteCookie(event, APP_TOKEN_COOKIE, { path: '/' });
}

// 注：密码强度校验统一在前端 utils/password.ts 的 validatePasswordStrength 中完成
// （强度规则需对原始明文校验，而服务端只持有派生值，无法做内容校验）。

// ────────────────────────────────────────────────────────────
// 登录失败锁定（IP 维度，内存存储，重启清空）
// ────────────────────────────────────────────────────────────

interface LoginAttempt {
  count: number;
  lockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 锁定 15 分钟

/**
 * 查询某 IP 是否已被锁定
 * @returns 未锁定返回 null；已锁定返回剩余毫秒数
 */
export function getLockRemaining(ip: string): number | null {
  const attempt = loginAttempts.get(ip);
  if (!attempt?.lockedUntil) {
    return null;
  }
  if (attempt.lockedUntil <= Date.now()) {
    loginAttempts.delete(ip);
    return null;
  }
  return attempt.lockedUntil - Date.now();
}

/** 登录成功后清除该 IP 的失败记录 */
export function clearFailedAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * 记录一次登录失败，达到阈值则锁定
 */
export function recordFailedAttempt(ip: string): void {
  const attempt = loginAttempts.get(ip) ?? { count: 0 };
  attempt.count += 1;
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = Date.now() + LOCK_DURATION;
  }
  loginAttempts.set(ip, attempt);
}

/**
 * 修改门禁密码（设置页 / 首次设密共用）
 *
 * 步骤：校验新密码强度 → 比对新旧不能相同 → bcrypt 哈希新派生值 → 持久化 → 清空所有会话。
 * 清空会话后，当前调用方需自行重新下发新 token（见 change-password API）。
 *
 * @param oldDerived 旧密码的传输派生值
 * @param newDerived 新密码的传输派生值
 * @returns 校验失败返回错误信息；成功返回 true
 */
export async function changeAppPassword(
  oldDerived: string,
  newDerived: string,
): Promise<true | { error: string; statusCode: number }> {
  const credential = getCredential();
  if (!credential) {
    return { error: '门禁尚未初始化', statusCode: 500 };
  }

  // 校验旧密码
  const oldOk = await verifyDerived(oldDerived, credential.hash);
  if (!oldOk) {
    return { error: '旧密码错误', statusCode: 400 };
  }

  // 新旧不能相同（比较派生值即可，相同密码派生值必相同）
  if (oldDerived === newDerived) {
    return { error: '新密码不能与旧密码相同', statusCode: 400 };
  }

  // 持久化新凭证（标记为非初始）
  const newHash = await hashDerived(newDerived);
  saveCredential({
    hash: newHash,
    isInitial: false,
    updatedAt: Date.now(),
  });

  // 清空所有会话，强制其他设备重新登录
  clearAllSessions();
  return true;
}
