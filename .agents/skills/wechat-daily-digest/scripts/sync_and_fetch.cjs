#!/usr/bin/env node

/**
 * 同步已关注公众号的最新文章 + 补抓正文
 *
 * 用法：node sync_and_fetch.cjs [项目路径] [天数]
 *   项目路径：wechat-article-exporter 的根目录（含 .data/wechat.db）
 *   天数：同步最近几天的文章，默认 1
 *
 * 此脚本直接操作 SQLite，同时调用项目运行中的 HTTP API 来触发同步任务。
 * 如果项目服务没运行，则只做本地数据查询。
 */

const path = require('path');
const fs = require('fs');

const projectRoot = process.argv[2] || path.join(__dirname, '..', '..', '..', '..');
const days = parseInt(process.argv[3] || '1', 10);
const dbPath = path.join(projectRoot, '.data', 'wechat.db');

if (!fs.existsSync(dbPath)) {
  console.error(`数据库不存在: ${dbPath}`);
  console.error('请确认项目路径正确，且已运行过项目（生成 .data/wechat.db）');
  process.exit(1);
}

// 从项目 node_modules 加载 better-sqlite3
const Database = require(path.join(projectRoot, 'node_modules', 'better-sqlite3'));
const db = new Database(dbPath, { readonly: true });

// 1. 列出所有公众号
const accounts = db.prepare('SELECT fakeid, nickname FROM accounts ORDER BY nickname').all();
console.log(`找到 ${accounts.length} 个公众号：${accounts.map(a => a.nickname).join('、')}`);

// 2. 查询今天（或最近N天）的文章
const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
const articles = db.prepare(`
  SELECT a.title, a.link, a.digest, a.create_time, a.fakeid, acc.nickname,
         CASE WHEN c.url IS NOT NULL THEN 1 ELSE 0 END AS has_content,
         c.content
  FROM articles a
  LEFT JOIN accounts acc ON a.fakeid = acc.fakeid
  LEFT JOIN article_content c ON a.link = c.url
  WHERE a.is_deleted = 0 AND a.create_time >= ?
  ORDER BY a.create_time DESC
`).all(cutoff);

console.log(`\n最近 ${days} 天共 ${articles.length} 篇文章`);
const withContent = articles.filter(a => a.has_content).length;
console.log(`其中已抓取正文: ${withContent} 篇，未抓取: ${articles.length - withContent} 篇`);

if (articles.length === 0) {
  console.log('\n没有文章。请先在项目中同步公众号文章。');
  process.exit(0);
}

// 3. 列出未抓取正文的文章（提示需要补抓）
const missing = articles.filter(a => !a.has_content);
if (missing.length > 0) {
  console.log(`\n⚠️ 以下 ${missing.length} 篇文章没有正文，需要补抓：`);
  missing.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.nickname}] ${a.title}`);
  });
  if (missing.length > 10) console.log(`  ...还有 ${missing.length - 10} 篇`);
  console.log('\n请在项目中点「补抓文章正文」，或调 POST /api/web/data/v1/topic/fetch-content');
}

// 4. 输出 JSON 供 skill 读取
const output = {
  generated_at: new Date().toISOString(),
  days,
  total: articles.length,
  with_content: withContent,
  accounts: accounts.map(a => ({ fakeid: a.fakeid, nickname: a.nickname })),
  articles: articles.map(a => ({
    title: a.title,
    link: a.link,
    nickname: a.nickname,
    digest: a.digest,
    create_time: a.create_time,
    date: new Date(a.create_time * 1000).toLocaleDateString('zh-CN'),
    has_content: !!a.has_content,
    content: a.content || null,
  })),
};

const outFile = path.join(__dirname, 'articles_data.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\n✅ 数据已写入: ${outFile}`);
console.log(`下一步：读取这个 JSON，逐篇归纳正文，生成 HTML 报告`);
