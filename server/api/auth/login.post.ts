/**
 * 用户登录 API
 * POST /api/auth/login
 *
 * 登录成功后会设置 auth-key cookie，用于：
 * 1. 验证用户身份
 * 2. 微信登录时关联用户的微信 cookie
 */

import { randomUUID } from 'uncrypto';
import { createUser, getUserByToken, getUserByUsername, updateUserToken } from '~/server/database/user';
import { log } from '~/server/utils/log';

interface LoginBody {
  username: string;
  password: string;
}

interface LoginAttempt {
  count: number;
  last_attempt: number;
  locked_until?: number;
}

// 登录尝试记录（内存存储，重启后清空）
const loginAttempts = new Map<string, LoginAttempt>();

const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 15 分钟

export default defineEventHandler(async event => {
  try {
    const body = await readBody<LoginBody>(event);
    const { username, password } = body;

    // 参数验证
    if (!username || !password) {
      throw createError({
        statusCode: 400,
        message: '用户名和密码不能为空',
      });
    }

    // 获取客户端 IP
    const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';

    // 检查是否被锁定
    const attempt = loginAttempts.get(ip);
    if (attempt && attempt.locked_until && attempt.locked_until > Date.now()) {
      const remainingMinutes = Math.ceil((attempt.locked_until - Date.now()) / 60000);
      throw createError({
        statusCode: 429,
        message: `登录失败次数过多，请 ${remainingMinutes} 分钟后重试`,
      });
    }

    // 查找用户
    let user = getUserByUsername(username);

    // 如果用户不存在且是默认账号，自动创建
    if (!user) {
      if (username === 'admin' && password === 'admin') {
        // 生成初始 token
        const initialToken = randomUUID().replace(/-/g, '');

        // 创建用户
        const success = createUser(username, password, initialToken);
        if (!success) {
          throw createError({
            statusCode: 500,
            message: '创建用户失败',
          });
        }

        user = getUserByUsername(username)!;
      } else {
        // 记录失败尝试
        recordFailedAttempt(ip);
        throw createError({
          statusCode: 401,
          message: '用户名或密码错误',
        });
      }
    }

    // 验证密码
    if (user.password !== password) {
      recordFailedAttempt(ip);
      throw createError({
        statusCode: 401,
        message: '用户名或密码错误',
      });
    }

    // 清除失败尝试记录
    loginAttempts.delete(ip);

    // 使用用户已有的 token（不生成新的）
    // 这样同一用户在不同浏览器登录后，可以获得相同的 auth-key
    const userToken = user.token;

    // 设置 auth-key cookie
    setCookie(event, 'auth-key', userToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: '/',
    });

    // 返回成功响应
    return {
      success: true,
      data: {
        token: userToken,
        username: user.username,
      },
      message: '登录成功',
    };
  } catch (error) {
    // 如果是已知的错误，直接抛出
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    // 未知错误
    log.error('登录失败:', error);
    throw createError({
      statusCode: 500,
      message: '登录失败，请稍后重试',
    });
  }
});

/**
 * 记录登录失败尝试
 */
function recordFailedAttempt(ip: string) {
  const attempt = loginAttempts.get(ip) || {
    count: 0,
    last_attempt: 0,
  };

  attempt.count++;
  attempt.last_attempt = Date.now();

  // 如果达到最大尝试次数，锁定账户
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.locked_until = Date.now() + LOCK_DURATION;
  }

  loginAttempts.set(ip, attempt);
}
