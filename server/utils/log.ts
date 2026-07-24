/**
 * 带时间戳的日志工具
 *
 * 用法：在业务代码中用 log.info / log.error / log.warn 代替 console.log / console.error / console.warn。
 * 自动在每行输出前加上本地时间戳（含年月日）。
 *
 * 格式：[YYYY-MM-DD HH:mm:ss] 原有内容
 */

/** 格式化当前本地时间为 YYYY-MM-DD HH:mm:ss（纯函数） */
function ts(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

export const log = {
  info: (...args: any[]) => console.log(`[${ts()}]`, ...args),
  warn: (...args: any[]) => console.warn(`[${ts()}]`, ...args),
  error: (...args: any[]) => console.error(`[${ts()}]`, ...args),
};
