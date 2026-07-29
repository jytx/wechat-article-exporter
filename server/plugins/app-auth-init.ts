/**
 * 应用门禁启动初始化
 *
 * 首次启动时（数据库中尚无门禁凭证），写入默认密码的凭证：
 * - 默认密码：admin@123
 * - 标记 isInitial = true，要求首次登录后强制修改
 *
 * 安全：存储的是「默认密码的传输派生值」经 bcrypt 哈希后的结果，非明文。
 * 派生算法与前端 utils/password.ts 完全一致。
 */

import { getCredential, saveCredential } from '~/server/database/app-auth';
import { hashDerived } from '~/server/utils/app-auth';
import { derivePasswordForTransport } from '~/utils/password';
import { log } from '~/server/utils/log';

/** 默认初始密码（首次登录后强制修改） */
const DEFAULT_PASSWORD = 'admin@123';

export default defineNitroPlugin(async () => {
  const existing = getCredential();
  if (existing) {
    // 已初始化过，跳过
    return;
  }

  try {
    // 1. 计算默认密码的传输派生值（与前端一致）
    const derived = await derivePasswordForTransport(DEFAULT_PASSWORD);
    // 2. 对派生值做 bcrypt 慢哈希后持久化
    const hash = await hashDerived(derived);
    saveCredential({
      hash,
      isInitial: true,
      updatedAt: Date.now(),
    });
    log.info('应用门禁已初始化默认密码，首次登录后将要求修改');
  } catch (error) {
    log.error('应用门禁初始化失败:', error);
  }
});
