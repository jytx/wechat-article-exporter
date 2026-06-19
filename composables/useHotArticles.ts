/**
 * 热文榜 Composable
 * 封装热文榜查询、指标采集触发、采集状态查询等 API 调用
 */

import { api } from '~/utils/api-client';

export interface HotArticle {
  url: string;
  fakeid: string;
  title: string;
  read_num: number;
  old_like_num: number;
  share_num: number;
  like_num: number;
  comment_num: number;
  article_create_time?: number;
  sampled_at?: number;
  account_nickname?: string;
}

export interface RankingParams {
  fakeids?: string[];
  days?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface RankingResponse {
  items: HotArticle[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
  };
}

export interface CollectResult {
  success: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface MetricsStats {
  total_articles: number;
  total_accounts: number;
  last_sampled_at: number | null;
}

export interface UpsertMetricParams {
  url: string;
  fakeid?: string;
  title?: string;
  read_num?: number;
  old_like_num?: number;
  share_num?: number;
  like_num?: number;
  comment_num?: number;
}

/**
 * 查询热文榜
 */
export function useHotArticles() {
  /**
   * 查询热文榜列表
   */
  async function fetchRanking(params: RankingParams): Promise<RankingResponse> {
    const query: Record<string, any> = {
      orderBy: params.orderBy || 'read_num',
      order: params.order || 'desc',
      page: params.page || 1,
      pageSize: params.pageSize || 50,
    };
    if (params.fakeids && params.fakeids.length > 0) {
      query.fakeids = params.fakeids.join(',');
    }
    if (params.days && params.days > 0) {
      query.days = params.days;
    }
    return api.get<RankingResponse>('/metrics/ranking', query);
  }

  /**
   * 上报单篇文章指标（客户端抓取到阅读量后调用）
   */
  async function upsertMetric(metric: UpsertMetricParams): Promise<boolean> {
    try {
      const result = await api.post<{ saved: boolean }>('/metrics/upsert', metric);
      return result.saved === true;
    } catch (e) {
      console.warn('upsertMetric 失败:', e);
      return false;
    }
  }

  /**
   * 查询采集状态
   */
  async function fetchStats(): Promise<MetricsStats> {
    return api.get<MetricsStats>('/metrics/stats');
  }

  return {
    fetchRanking,
    upsertMetric,
    fetchStats,
  };
}
