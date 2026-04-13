/**
 * IndexedDB 数据导出工具
 * 用于从 IndexedDB 导出公众号和文章数据，以便迁移到后端 API
 */

import { getAllInfo } from '~/store/v2/info';
import { getAllArticlesByFakeid } from '~/store/v2/article';
import type { AppMsgExWithFakeID } from '~/types/types';
import type { MpAccount } from '~/store/v2/info';

export interface ExportedAccount {
  fakeid: string;
  nickname?: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  total_count: number;
  synced_count: number;
  create_time?: number;
  update_time?: number;
}

export interface ExportedArticle {
  key: string;
  fakeid: string;
  aid: number;
  title: string;
  link: string;
  cover?: string;
  author?: string;
  create_time: number;
  datetime?: string;
  digest?: string;
  downloaded?: boolean;
  downloadedAt?: string;
  is_deleted?: boolean;
}

export interface ExportedData {
  usefor: 'wechat-article-exporter';
  version: '1.0';
  exported_at: string;
  accounts: ExportedAccount[];
  articles: ExportedArticle[];
}

/**
 * 从 IndexedDB 导出所有数据
 */
export async function exportFromIndexedDB(): Promise<ExportedData> {
  // 1. 导出公众号数据
  const accounts = await getAllInfo();
  const exportedAccounts: ExportedAccount[] = accounts.map(account => ({
    fakeid: account.fakeid,
    nickname: account.nickname,
    alias: undefined, // IndexedDB 没有这个字段
    round_head_img: account.round_head_img,
    signature: undefined, // IndexedDB 没有这个字段
    total_count: account.total_count,
    synced_count: account.articles, // articles 是已同步的文章数
    create_time: account.create_time,
    update_time: account.update_time
  }));

  // 2. 导出文章数据
  const exportedArticles: ExportedArticle[] = [];

  for (const account of accounts) {
    try {
      const articles = await getAllArticlesByFakeid(account.fakeid);

      for (const article of articles) {
        exportedArticles.push({
          key: `${article.fakeid}:${article.aid}`,
          fakeid: article.fakeid,
          aid: article.aid,
          title: article.title,
          link: article.link,
          cover: article.cover,
          author: article.author,
          create_time: article.create_time,
          datetime: article.datetime,
          digest: article.digest,
          downloaded: article.downloaded,
          downloadedAt: article.downloadedAt,
          is_deleted: article.is_deleted
        });
      }
    } catch (error) {
      console.error(`导出公众号 [${account.fakeid}] 的文章失败:`, error);
    }
  }

  return {
    usefor: 'wechat-article-exporter',
    version: '1.0',
    exported_at: new Date().toISOString(),
    accounts: exportedAccounts,
    articles: exportedArticles
  };
}

/**
 * 导出数据为 JSON 文件并触发下载
 */
export async function downloadExportedData(): Promise<void> {
  const data = await exportFromIndexedDB();

  // 创建 JSON Blob
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wechat-article-exporter-migration-${new Date().toISOString().split('T')[0]}.json`;

  // 触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 释放 URL
  URL.revokeObjectURL(url);
}

/**
 * 获取 IndexedDB 数据统计信息
 */
export async function getIndexedDBStats(): Promise<{
  accounts: number;
  articles: number;
  estimatedSize: string;
}> {
  const accounts = await getAllInfo();
  let totalArticles = 0;

  for (const account of accounts) {
    try {
      const articles = await getAllArticlesByFakeid(account.fakeid);
      totalArticles += articles.length;
    } catch (error) {
      console.error(`统计公众号 [${account.fakeid}] 文章数失败:`, error);
    }
  }

  // 估算大小（粗略计算）
  const estimatedSize = JSON.stringify({
    accounts: accounts.length,
    articles: totalArticles
  }).length;

  let sizeText = '';
  if (estimatedSize < 1024) {
    sizeText = `${estimatedSize} B`;
  } else if (estimatedSize < 1024 * 1024) {
    sizeText = `${(estimatedSize / 1024).toFixed(2)} KB`;
  } else {
    sizeText = `${(estimatedSize / (1024 * 1024)).toFixed(2)} MB`;
  }

  return {
    accounts: accounts.length,
    articles: totalArticles,
    estimatedSize: sizeText
  };
}

/**
 * 导出单个公众号的数据
 */
export async function exportAccountData(fakeid: string): Promise<{
  account: ExportedAccount | null;
  articles: ExportedArticle[];
}> {
  // 获取公众号信息
  const accounts = await getAllInfo();
  const account = accounts.find(a => a.fakeid === fakeid);

  if (!account) {
    return {
      account: null,
      articles: []
    };
  }

  const exportedAccount: ExportedAccount = {
    fakeid: account.fakeid,
    nickname: account.nickname,
    alias: undefined,
    round_head_img: account.round_head_img,
    signature: undefined,
    total_count: account.total_count,
    synced_count: account.articles,
    create_time: account.create_time,
    update_time: account.update_time
  };

  // 获取文章数据
  const articles = await getAllArticlesByFakeid(fakeid);
  const exportedArticles: ExportedArticle[] = articles.map(article => ({
    key: `${article.fakeid}:${article.aid}`,
    fakeid: article.fakeid,
    aid: article.aid,
    title: article.title,
    link: article.link,
    cover: article.cover,
    author: article.author,
    create_time: article.create_time,
    datetime: article.datetime,
    digest: article.digest,
    downloaded: article.downloaded,
    downloadedAt: article.downloadedAt,
    is_deleted: article.is_deleted
  }));

  return {
    account: exportedAccount,
    articles: exportedArticles
  };
}
