/**
 * 应用门禁修改密码 API
 * POST /api/app-auth/change-password
 *
 * 同时服务于：
 * 1. 首次登录后的强制设密（此时已带登录下发的临时 token）
 * 2. 设置页中的日常修改密码
 *
 * 流程：校验旧派生值 → 校验新密码强度 → 持久化新哈希 → 清空所有会话
 *       → 为当前调用方换发新 token（避免改密后自己立即被踢）。
 *
 * 入参字段 oldDerived / newDerived 均为前端派生值，非明文。
 */

import { randomUUID } from 'uncrypto';
import { addSession } from '~/server/database/app-auth';
import { getCredential } from '~/server/database/app-auth';
import {
  APP_TOKEN_COOKIE,
  changeAppPassword,
  setAppTokenCookie,
} from '~/server/utils/app-auth';

interface ChangePasswordBody {
  /** 旧密码传输派生值 */
  oldDerived: string;
  /** 新密码传输派生值 */
  newDerived: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody<ChangePasswordBody>(event);
    const { oldDerived, newDerived } = body ?? {};

    if (!oldDerived || !newDerived) {
      throw createError({ statusCode: 400, message: '旧密码和新密码不能为空' });
    }
    // 派生值为 64 位 hex；长度兜底，防异常输入
    if (oldDerived.length !== 64 || newDerived.length !== 64) {
      throw createError({ statusCode: 400, message: '密码格式无效' });
    }

    // 复用业务层完成校验 + 持久化 + 清空会话
    const result = await changeAppPassword(oldDerived, newDerived);
    if (result !== true) {
      throw createError({ statusCode: result.statusCode, message: result.error });
    }

    // 改密已清空全部会话，这里为当前调用方换发新会话，保持其登录态
    const newToken = randomUUID().replace(/-/g, '');
    addSession(newToken);
    setAppTokenCookie(event, newToken);

    // 读取最新凭证，返回是否仍是初始态（正常情况下应为 false）
    const credential = getCredential();

    return {
      success: true,
      data: {
        isInitial: credential?.isInitial ?? false,
      },
      message: '密码修改成功',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    log.error('门禁修改密码失败:', error);
    throw createError({ statusCode: 500, message: '修改密码失败，请稍后重试' });
  }
});
