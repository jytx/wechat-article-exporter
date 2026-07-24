/**
 * SQLite 数据库连接和初始化
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { initializeSettingsTable } from '~/server/database/settings';
import { initializeUserTable } from '~/server/database/user';

let db: Database.Database | null = null;

/**
 * 获取数据库连接
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // 数据库文件路径
    const dbPath = join(process.cwd(), '.data', 'wechat.db');

    // 创建数据库连接
    db = new Database(dbPath);

    // 启用 WAL 模式以提高并发性能
    db.pragma('journal_mode = WAL');

    // 初始化表结构
    initializeSchema(db);
  }

  return db;
}

/**
 * 初始化数据库表结构
 */
function initializeSchema(database: Database.Database) {
  // 创建公众号表
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      fakeid TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      alias TEXT,
      round_head_img TEXT,
      signature TEXT,
      total_count INTEGER DEFAULT 0,
      synced_count INTEGER DEFAULT 0,
      create_time INTEGER NOT NULL,
      update_time INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_nickname ON accounts(nickname);
    CREATE INDEX IF NOT EXISTS idx_accounts_create_time ON accounts(create_time);
  `);

  // 创建文章表
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      fakeid TEXT NOT NULL,
      aid INTEGER NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      cover TEXT,
      author TEXT,
      create_time INTEGER,
      update_time INTEGER,
      datetime TEXT,
      digest TEXT,
      downloaded INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      album_id TEXT,
      appmsg_album_infos TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_key ON articles(key);
    CREATE INDEX IF NOT EXISTS idx_articles_fakeid ON articles(fakeid);
    CREATE INDEX IF NOT EXISTS idx_articles_downloaded ON articles(downloaded);
  `);

  // 创建文章内容表（HTML）
  database.exec(`
    CREATE TABLE IF NOT EXISTS article_html (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      fakeid TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      comment_id TEXT,
      downloaded_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_article_html_url ON article_html(url);
    CREATE INDEX IF NOT EXISTS idx_article_html_fakeid ON article_html(fakeid);
  `);

  // 创建 Cookie 表
  database.exec(`
    CREATE TABLE IF NOT EXISTS cookies (
      auth_key TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      cookies TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cookies_token ON cookies(token);
  `);

  // 创建用户表
  initializeUserTable();

  // 创建设置表
  initializeSettingsTable();

  // 创建文章指标表（阅读量/点赞/分享等，用于热文榜）
  database.exec(`
    CREATE TABLE IF NOT EXISTS article_metrics (
      url TEXT PRIMARY KEY,
      fakeid TEXT NOT NULL,
      title TEXT NOT NULL,
      read_num INTEGER DEFAULT 0,
      old_like_num INTEGER DEFAULT 0,
      share_num INTEGER DEFAULT 0,
      like_num INTEGER DEFAULT 0,
      comment_num INTEGER DEFAULT 0,
      article_create_time INTEGER,
      sampled_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_read_num ON article_metrics(read_num DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_fakeid ON article_metrics(fakeid);
    CREATE INDEX IF NOT EXISTS idx_metrics_article_time ON article_metrics(article_create_time);
  `);

  // 文章纯文本正文表（cheerio 从原始 HTML 提取，给 AI/日报/MCP 读取用，~5KB/篇）
  // 与 article_html（原始HTML，给导出用）并存，互不干扰
  database.exec(`
    CREATE TABLE IF NOT EXISTS article_content (
      url TEXT PRIMARY KEY,
      fakeid TEXT,
      title TEXT,
      content TEXT,
      fetched_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_article_content_fakeid ON article_content(fakeid);
  `);

  // 文章推送去重表：记录每篇文章是否已被订阅推送过
  // 以 article.key 为主键，保证同一篇文章无论用什么时间字段查询都只推送一次
  database.exec(`
    CREATE TABLE IF NOT EXISTS article_push_log (
      article_key TEXT PRIMARY KEY NOT NULL,
      pushed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
