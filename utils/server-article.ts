/**
 * 从服务端获取文章信息的工具函数
 * 替代 IndexedDB 的 getArticleByLink
 */

import type { AppMsgExWithFakeID } from '~/types/types';

/**
 * 根据文章链接从服务端获取文章信息
 * @param url 文章链接
 * @returns 文章信息，如果不存在则返回 null
 */
export async function getArticleByLinkFromServer(url: string): Promise<AppMsgExWithFakeID | null> {
  try {
    const response = await fetch(`/api/web/data/v1/articles/by-link?url=${encodeURIComponent(url)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`获取文章信息失败: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      return data.data as AppMsgExWithFakeID;
    }
    return null;
  } catch (error) {
    console.error('getArticleByLinkFromServer 失败:', error);
    return null;
  }
}

/**
 * 根据文章 key 从服务端获取文章信息
 * @param key 文章 key (格式: fakeid:aid)
 * @returns 文章信息，如果不存在则返回 null
 */
export async function getArticleByKeyFromServer(key: string): Promise<AppMsgExWithFakeID | null> {
  try {
    const response = await fetch(`/api/web/data/v1/articles/${encodeURIComponent(key)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`获取文章信息失败: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      return data.data as AppMsgExWithFakeID;
    }
    return null;
  } catch (error) {
    console.error('getArticleByKeyFromServer 失败:', error);
    return null;
  }
}
