/**
 * 读取服务端日志文件
 * GET /api/web/data/v1/logs?type=sync&limit=500
 *
 * 参数：
 *   type  - 日志类型筛选：sync（同步）/ schedule（定时任务）/ other（其他）/ all（全部，默认）
 *   limit - 返回最后 N 行，默认 500
 */

import { promises as fs } from 'fs';
import path from 'path';
import { successResponse } from '~/server/utils/api-response';

/** 日志行的结构化解析结果 */
interface LogLine {
  raw: string;
  type: 'sync' | 'schedule' | 'other';
  level: 'info' | 'warn' | 'error';
}

/**
 * 解析单行日志，提取类型和级别（纯函数，不修改入参）
 */
function parseLogLine(line: string): LogLine {
  // 级别判定：行首或行内包含 ERROR/error → error；WARN → warn；其余 info
  const upper = line.toUpperCase();
  let level: LogLine['level'] = 'info';
  if (upper.includes('ERROR') || upper.includes('SESSION 过期') || upper.includes('失败')) {
    level = 'error';
  } else if (upper.includes('WARN')) {
    level = 'warn';
  }

  // 类型判定：按前缀归类
  let type: LogLine['type'] = 'other';
  if (line.includes('[sync-task') || line.includes('[sync-account]')) {
    type = 'sync';
  } else if (line.includes('[auto-sync]')) {
    type = 'schedule';
  }

  return { raw: line, type, level };
}

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const type = (query.type as string) || 'all';
  const limit = Math.min(2000, Number(query.limit) || 500);

  const logPath = path.resolve(process.cwd(), 'logs/dev-server.log');

  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const allLines = content.split('\n').filter(l => l.trim());

    // 取最后 limit 行
    const tail = allLines.slice(-limit);

    // 解析每行
    let lines = tail.map(parseLogLine);

    // 按类型筛选
    if (type !== 'all') {
      lines = lines.filter(l => l.type === type);
    }

    return successResponse({
      lines,
      total: allLines.length,
      filtered: lines.length,
    });
  } catch (e: any) {
    // 日志文件不存在或读取失败
    return successResponse({
      lines: [],
      total: 0,
      filtered: 0,
      error: e?.code === 'ENOENT' ? '日志文件不存在' : '读取日志失败',
    });
  }
});
