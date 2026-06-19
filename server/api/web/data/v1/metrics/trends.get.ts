/**
 * 选题关键词趋势
 * GET /api/web/data/v1/metrics/trends
 *
 * 统计最近 N 天内文章标题/摘要中的高频关键词，
 * 帮助发现"最近大家都在写什么"。
 *
 * 不依赖阅读量，纯基于已同步的 articles 表数据。
 *
 * 参数：
 *   fakeids - 逗号分隔的公众号ID（可选）
 *   days    - 时间范围，默认 7 天
 *   limit   - 返回关键词数量，默认 30
 */

import { getDatabase } from '~/server/utils/database';
import { successResponse } from '~/server/utils/api-response';

// 停用词表（中文常见无意义词 + 英文常见词）
const STOP_WORDS = new Set([
  // 中文停用词
  '的', '了', '和', '是', '在', '我', '有', '这', '那', '也', '都', '就',
  '你', '他', '她', '它', '们', '为', '以', '及', '或', '与', '但', '而',
  '一', '二', '三', '个', '中', '上', '下', '不', '也', '人', '大', '小',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of',
  'in', 'on', 'at', 'for', 'by', 'with', 'from', 'as', 'it', 'this', 'that',
  'and', 'or', 'but', 'not', 'no', 'yes', 'do', 'does', 'did', 'will',
]);

/**
 * 从文本中提取候选关键词（简单分词：提取2-6字的中文片段 + 英文单词）
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // 提取英文单词（3字母以上）
  const englishMatches = text.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || [];
  for (const word of englishMatches) {
    const lower = word.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length >= 3) {
      keywords.push(lower);
    }
  }

  // 提取中文词组（2-6个连续中文字符）
  // 用滑动窗口提取所有 2~4 字片段，过滤停用词
  const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const segment of chineseSegments) {
    // 对每个连续中文片段，提取 2~4 字子串
    for (let len = 2; len <= Math.min(4, segment.length); len++) {
      for (let i = 0; i <= segment.length - len; i++) {
        const word = segment.substring(i, i + len);
        if (!STOP_WORDS.has(word)) {
          keywords.push(word);
        }
      }
    }
  }

  return keywords;
}

export interface TrendItem {
  keyword: string;
  count: number; // 出现在多少篇文章中
}

export default defineEventHandler(async event => {
  const query = getQuery(event);

  const fakeidsRaw = query.fakeids as string | undefined;
  const fakeids = fakeidsRaw
    ? fakeidsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;

  const days = query.days !== undefined ? Math.max(0, Number(query.days)) : 7;
  const limit = Math.min(100, Math.max(5, Number(query.limit || 30)));

  const db = getDatabase();

  // 构建 WHERE 条件
  const where: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  if (fakeids && fakeids.length > 0) {
    const placeholders = fakeids.map(() => '?').join(',');
    where.push(`fakeid IN (${placeholders})`);
    params.push(...fakeids);
  }

  // days=0 表示不限时间（全部）
  if (days > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    where.push('(create_time IS NULL OR create_time >= ?)');
    params.push(cutoff);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  // 拉取最近文章的标题+摘要
  const rows = db
    .prepare(`SELECT title, digest FROM articles ${whereClause}`)
    .all(...params) as { title: string; digest: string | null }[];

  // 统计关键词频率（按文章去重：一篇文章中某词只计一次）
  const keywordArticleCount = new Map<string, Set<string>>(); // keyword -> Set<articleTitle>

  for (const row of rows) {
    const text = `${row.title || ''} ${row.digest || ''}`;
    const keywords = extractKeywords(text);
    const uniqueKeywords = new Set(keywords); // 同篇文章去重
    for (const kw of uniqueKeywords) {
      if (!keywordArticleCount.has(kw)) {
        keywordArticleCount.set(kw, new Set());
      }
      keywordArticleCount.get(kw)!.add(row.title || '');
    }
  }

  // 转为数组并排序
  const trends: TrendItem[] = Array.from(keywordArticleCount.entries())
    .map(([keyword, articleSet]) => ({
      keyword,
      count: articleSet.size,
    }))
    .filter(item => item.count >= 2) // 至少出现在2篇文章中
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return successResponse({
    trends,
    totalArticles: rows.length,
    days,
  });
});
