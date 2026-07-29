/**
 * 应用门禁登录 API
 * POST /api/app-auth/login
 *
 * 入参：passwordDerived —— 原始密码经前端派生后的值（SHA-256(密码+盐)），非明文。
 * 成功：下发 app_token cookie（30 天），返回 isInitial 标记（是否需强制改密）。
 * 失败：记录 IP 失败次数，达到阈值锁定 15 分钟。
 */

import { randomUUID } from 'uncrypto';
import { addSession } from '~/server/database/app-auth';
import {
  clearFailedAttempts,
  getLockRemaining,
  recordFailedAttempt,
  setAppTokenCookie,
  verifyDerived,
} from '~/server/utils/app-auth';
import { getCredential } from '~/server/database/app-auth';

interface LoginBody {
  /** 密码传输派生值 */
  passwordDerived: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<LoginBody>(event);
    const derived = body?.passwordDerived;

    if (!derived) {
      throw createError({ statusCode: 400, message: '密码不能为空' });
    }
    // 派生值为 64 位 hex；长度兜底
    if (derived.length !== 64) {
      throw createError({ statusCode: 400, message: '密码格式无效' });
    }

    const credential = getCredential();
    if (!credential) {
      // 服务端尚未初始化凭证（理论上启动插件已完成初始化）
      throw createError({ statusCode: 503, message: '门禁尚未就绪，请稍后重试' });
    }

    // IP 维度失败锁定
    const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
    const lockRemaining = getLockRemaining(ip);
    if (lockRemaining !== null) {
      const minutes = Math.ceil(lockRemaining / 60000);
      throw createError({
        statusCode: 429,
        message: `登录失败次数过多，请 ${minutes} 分钟后重试`,
      });
    }

    // 校验派生值
    const ok = await verifyDerived(derived, credential.hash);
    if (!ok) {
      recordFailedAttempt(ip);
      throw createError({ statusCode: 401, message: '密码错误' });
    }

    // 登录成功：签发新会话 token 并下发 cookie
    clearFailedAttempts(ip);
    const token = randomUUID().replace(/-/g, '');
    addSession(token);
    setAppTokenCookie(event, token);

    return {
      success: true,
      data: {
        isInitial: credential.isInitial,
      },
      message: '登录成功',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    log.error('门禁登录失败:', error);
    throw createError({ statusCode: 500, message: '登录失败，请稍后重试' });
  }
});
