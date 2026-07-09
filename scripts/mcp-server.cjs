#!/usr/bin/env node

/**
 * 微信公众号导出工具 - MCP Server
 *
 * 让 Claude Code / Hermes 等 MCP Client 通过 MCP 协议查询本项目的数据：
 * - list_accounts：列出公众号
 * - query_articles：查最近文章（标题+摘要）
 * - read_article_content：读文章正文
 * - get_history_topics：查历史选题
 * - save_topic：保存选题建议
 *
 * 用法（Claude Code 配置）：
 *   在 .mcp.json 或 Claude 配置里加：
 *   {
 *     "mcpServers": {
 *       "wechat-articles": {
 *         "command": "node",
 *         "args": ["/绝对路径/wechat-article-exporter/scripts/mcp-server.cjs"]
 *       }
 *     }
 *   }
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const path = require('path');

// 连接项目的 SQLite
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', '.data', 'wechat.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

const server = new McpServer({
  name: 'wechat-article-exporter',
  version: '1.0.0',
});

// ========== 工具 1：列出公众号 ==========
server.tool(
  'list_accounts',
  '列出所有已同步的公众号（名称、文章数、简介）',
  {},
  async () => {
    const rows = getDb().prepare(`
      SELECT fakeid, nickname, alias, signature, total_count, synced_count
      FROM accounts ORDER BY nickname
    `).all();

    const text = rows.length === 0
      ? '暂无公众号，请先在公众号管理页同步公众号。'
      : rows.map((r, i) =>
          `${i + 1}. ${r.nickname}（${r.alias || '无微信号'}）\n` +
          `   fakeid: ${r.fakeid}\n` +
          `   文章数: ${r.synced_count}/${r.total_count}\n` +
          `   简介: ${r.signature || '无'}`
        ).join('\n\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ========== 工具 2：查最近文章 ==========
server.tool(
  'query_articles',
  '查询最近的文章列表（标题+摘要+发布时间+公众号）。用于了解最近有哪些内容、发现热点趋势。',
  {
    days: z.number().default(7).describe('查最近多少天的文章'),
    limit: z.number().default(30).describe('最多返回多少篇'),
    fakeid: z.string().optional().describe('可选，只查某个公众号（传 fakeid）'),
    keyword: z.string().optional().describe('可选，按关键词过滤标题或摘要'),
  },
  async (params) => {
    const days = Math.max(1, Math.min(90, params.days || 7));
    const limit = Math.max(1, Math.min(100, params.limit || 30));
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    let sql = `
      SELECT a.title, a.link, a.digest, a.create_time, a.fakeid, acc.nickname,
             CASE WHEN c.url IS NOT NULL THEN 1 ELSE 0 END AS has_content
      FROM articles a
      LEFT JOIN accounts acc ON a.fakeid = acc.fakeid
      LEFT JOIN article_content c ON a.link = c.url
      WHERE a.is_deleted = 0 AND a.create_time >= ?
    `;
    const args = [cutoff];

    if (params.fakeid) {
      sql += ' AND a.fakeid = ?';
      args.push(params.fakeid);
    }
    if (params.keyword) {
      sql += ' AND (a.title LIKE ? OR a.digest LIKE ?)';
      const kw = `%${params.keyword}%`;
      args.push(kw, kw);
    }
    sql += ' ORDER BY a.create_time DESC LIMIT ?';
    args.push(limit);

    const rows = getDb().prepare(sql).all(...args);

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: `最近 ${days} 天没有文章。可以尝试增大天数，或检查是否已同步文章。` }] };
    }

    const text = `共找到 ${rows.length} 篇文章（最近 ${days} 天）：\n\n` +
      rows.map((r, i) => {
        const date = new Date(r.create_time * 1000).toLocaleDateString('zh-CN');
        const flag = r.has_content ? '✅有正文' : '⚠️仅摘要';
        return `${i + 1}. [${r.nickname || '未知'}] ${r.title}\n` +
               `   ${date} | ${flag}\n` +
               `   摘要: ${r.digest || '无'}\n` +
               `   链接: ${r.link}`;
      }).join('\n\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ========== 工具 3：读文章正文 ==========
server.tool(
  'read_article_content',
  '读取某篇文章的完整正文（纯文本）。用于深入了解文章内容、做选题分析。传入文章的 link（URL）。',
  {
    link: z.string().describe('文章的 URL 链接（从 query_articles 结果里获取）'),
  },
  async (params) => {
    if (!params.link) {
      return { content: [{ type: 'text', text: '请传入 link 参数（文章 URL）' }] };
    }

    const row = getDb().prepare(
      'SELECT content, title FROM article_content WHERE url = ?'
    ).get(params.link);

    if (!row) {
      const meta = getDb().prepare('SELECT title, digest FROM articles WHERE link = ?').get(params.link);
      if (meta) {
        return { content: [{ type: 'text', text: `【${meta.title}】\n\n⚠️ 该文章尚未抓取正文，只有摘要：\n${meta.digest || '无摘要'}` }] };
      }
      return { content: [{ type: 'text', text: '未找到该文章，请确认 link 是否正确。' }] };
    }

    return { content: [{ type: 'text', text: `【${row.title}】\n\n${row.content}` }] };
  }
);

// ========== 工具 4：查历史选题 ==========
server.tool(
  'get_history_topics',
  '查询已生成的历史选题建议，避免重复。返回最近的选题列表。',
  {
    limit: z.number().default(20).describe('返回最近多少条'),
  },
  async (params) => {
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const rows = getDb().prepare(`
      SELECT title, angle, summary, keywords, created_at
      FROM ai_topics ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: '暂无历史选题。' }] };
    }

    const text = `历史选题（最近 ${rows.length} 条）：\n\n` +
      rows.map((r, i) => {
        const date = new Date(r.created_at * 1000).toLocaleDateString('zh-CN');
        let kw = '';
        try { kw = r.keywords ? JSON.parse(r.keywords).join('/') : ''; } catch {}
        return `${i + 1}. ${r.title}（${date}）\n   角度: ${r.angle || '无'}${kw ? '\n   关键词: ' + kw : ''}`;
      }).join('\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ========== 工具 5：保存选题 ==========
server.tool(
  'save_topic',
  '保存一条选题建议到数据库（方便后续在项目页面上查看）。',
  {
    title: z.string().describe('选题标题'),
    angle: z.string().optional().describe('切入角度/写作思路'),
    summary: z.string().optional().describe('选题说明'),
    keywords: z.string().optional().describe('关键词，用逗号分隔'),
    references: z.string().optional().describe('参考文章链接，用逗号分隔'),
  },
  async (params) => {
    if (!params.title) {
      return { content: [{ type: 'text', text: '请传入 title（选题标题）' }] };
    }

    const batchId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const keywords = params.keywords
      ? JSON.stringify(params.keywords.split(',').map(k => k.trim()).filter(Boolean))
      : null;

    let refJson = null;
    if (params.references) {
      const links = params.references.split(',').map(l => l.trim()).filter(Boolean);
      refJson = JSON.stringify(links.map(link => {
        const art = getDb().prepare('SELECT title, fakeid FROM articles WHERE link = ?').get(link);
        return { title: art?.title || '', link, source: art?.fakeid || '' };
      }));
    }

    getDb().prepare(`
      INSERT INTO ai_topics (batch_id, title, angle, summary, keywords, ref_articles, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(batchId, params.title, params.angle || null, params.summary || null,
          keywords, refJson, 'mcp-agent');

    return { content: [{ type: 'text', text: `✅ 选题已保存：${params.title}` }] };
  }
);

// ========== 启动 ==========
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[wechat-mcp] MCP Server 已启动，等待 Claude/Hermes 连接...');
}

main().catch(err => {
  console.error('[wechat-mcp] 启动失败:', err);
  process.exit(1);
});
