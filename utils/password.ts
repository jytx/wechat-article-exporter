/**
 * 密码工具（前后端共享）
 *
 * 安全设计：网络上绝不传输原始明文密码。
 * 客户端在发送前，先用本模块把「密码 + 应用固定盐」做 SHA-256，
 * 得到「传输派生值」（64 位 hex），只传输这个派生值。
 * 服务端再对该派生值做 bcrypt 慢哈希存储。
 *
 * 本文件位于 Nuxt 的 utils/ 目录，可被前端（浏览器）与服务端（Node/Nitro）同时自动导入。
 * 因此实现需兼容两种运行时的 Web Crypto：浏览器用 window.crypto.subtle，
 * Node 用 globalThis.crypto.subtle（Node 18+ 内置）。两者 API 一致。
 */

/**
 * 应用固定盐（pepper）
 * 用于前端派生运算。前后端必须完全一致（服务端从本模块导入）。
 * 说明：本应用为单租户自部署工具，固定盐可满足「不传明文」要求；
 * 服务端另叠加 bcrypt 随机盐做慢哈希，保障存储安全。
 */
export const APP_PEPPER = 'wae::app-auth::v1';

/**
 * 把密码加工为「传输派生值」
 * 算法：SHA-256( password + ":" + APP_PEPPER ) → hex 字符串
 *
 * 注意：为保证服务端插件在启动时（同步初始化流程）也能得到与前端一致的派生值，
 * 服务端请使用同一算法（见 server/plugins/app-auth-init.ts）。
 *
 * @param password 原始明文密码
 * @returns 64 位十六进制派生值
 */
export async function derivePasswordForTransport(password: string): Promise<string> {
  const text = `${password}:${APP_PEPPER}`;
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

/**
 * 密码强度校验（对原始明文密码校验）
 * 规则：长度 8-50；必须同时包含字母与数字。
 *
 * 注：服务端 utils/app-auth.ts 有同名实现（不引入前端模块以避免循环依赖），
 * 二者规则必须保持一致。
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('密码长度至少 8 位');
  }
  if (password.length > 50) {
    errors.push('密码长度不能超过 50 位');
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含字母');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含数字');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * ArrayBuffer → 小写十六进制字符串
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
