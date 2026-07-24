/**
 * 搜索文章接口（在已关注的公众号中搜索文章）
 */

import { getAllAccounts } from '~/server/database/account';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';
import { log } from '~/server/utils/log';

interface SearchArticleQuery {
  begin?: number;
  size?: number;
  keyword: string;
  fakeid?: string;
}

/**
 * HTML 实体解码
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x3D;': '=',
    '&#61;': '=',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, entity => entities[entity] || entity);
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString('zh-CN');
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

/**
 * 验证搜索关键词是否有效
 */
function isValidKeyword(keyword: any): boolean {
  if (!keyword || typeof keyword !== 'string') return false;

  const trimmed = keyword.trim();

  // 检查长度：微信搜索 API 限制
  if (trimmed.length === 0 || trimmed.length > 100) return false;

  // 检查是否包含有效字符（至少一个中文字符、英文字母或数字）
  const hasValidChar = /[\u4e00-\u9fa5a-zA-Z0-9]/.test(trimmed);

  return hasValidChar;
}

/**
 * 解析微信搜索响应中的文章列表
 */
function parseArticlesFromResponse(rawResponse: any, accountName: string): any[] {
  if (!rawResponse) {
    log.info('[parseArticlesFromResponse] rawResponse is null');
    return [];
  }

  if (rawResponse.base_resp?.ret !== 0) {
    log.info(`[parseArticlesFromResponse] base_resp.ret=${rawResponse.base_resp?.ret}, err_msg=${rawResponse.base_resp?.err_msg}`);
    return [];
  }

  if (!rawResponse.publish_page) {
    log.info('[parseArticlesFromResponse] no publish_page field, keys:', Object.keys(rawResponse).join(','));
    return [];
  }

  try {
    const publish_page = JSON.parse(rawResponse.publish_page);

    return publish_page.publish_list
      .filter((item: any) => !!item.publish_info)
      .flatMap((item: any) => {
        const publish_info = JSON.parse(item.publish_info);
        return publish_info.appmsgex;
      })
      .map((article: any) => ({
        ...article,
        account_nickname: accountName,
        title: decodeHtmlEntities(article.title),
        create_time_formatted: formatTimestamp(article.create_time),
      }));
  } catch (e) {
    log.error('解析搜索结果失败:', e);
    return [];
  }
}

/**
 * 在指定公众号中搜索文章
 */
async function searchArticlesInAccount(
  event: any,
  token: string,
  fakeid: string,
  keyword: string,
  begin: number,
  size: number
): Promise<any> {
  const params: Record<string, string | number> = {
    sub: 'search',
    search_field: '7',
    begin: begin,
    count: size,
    query: keyword,
    fakeid: fakeid,
    type: '101_1',
    free_publish_type: 1,
    sub_action: 'list_ex',
    token: token,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  const res = await proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: params,
    parseJson: true,
  }).catch(e => {
    log.error(`搜索公众号 ${fakeid} 文章失败:`, e);
    return null;
  });

  if (res) {
    log.info(
      `[search-article-debug] fakeid=${fakeid} keyword="${keyword}" ret=${res.base_resp?.ret} err_msg=${res.base_resp?.err_msg} has_publish_page=${!!res.publish_page} keys=${Object.keys(res).join(',')}`,
    );
  }

  return res;
}

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return {
      base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' },
      articles: [],
      total: 0,
    };
  }

  const query = getQuery<SearchArticleQuery>(event);
  const keyword = query.keyword;
  const fakeid = query.fakeid;

  // 验证搜索关键词
  if (!isValidKeyword(keyword)) {
    return {
      base_resp: {
        ret: -1,
        err_msg: '搜索关键词无效，请输入有效的文章标题关键字',
      },
      articles: [],
      total: 0,
    };
  }

  const begin: number = query.begin || 0;
  const size: number = query.size || 20;

  // 指定了 fakeid：在单个公众号中搜索（支持分页）
  if (fakeid) {
    const res = await searchArticlesInAccount(event, token, fakeid, keyword, begin, size);

    if (!res) {
      return {
        base_resp: { ret: -1, err_msg: '搜索文章接口失败，请重试' },
        articles: [],
        total: 0,
      };
    }

    if (res.base_resp?.ret === 0) {
      const account = await getAllAccounts().then(accounts => accounts.find(a => a.fakeid === fakeid));
      const articles = parseArticlesFromResponse(res, account?.nickname || '未知公众号');
      const publish_page = JSON.parse(res.publish_page);

      return {
        base_resp: { ret: 0 },
        articles: articles,
        total: publish_page.total_count || articles.length,
        hasMore: begin + articles.length < publish_page.total_count,
      };
    }

    return {
      base_resp: res.base_resp,
      articles: [],
      total: 0,
    };
  }

  // 未指定 fakeid：在所有已关注公众号中并发搜索
  const myAccounts = await getAllAccounts();

  if (!myAccounts || myAccounts.length === 0) {
    return {
      base_resp: { ret: -1, err_msg: '请先添加公众号后再搜索文章' },
      articles: [],
      total: 0,
    };
  }

  const searchPromises = myAccounts.map(account =>
    searchArticlesInAccount(event, token, account.fakeid, keyword, 0, size)
  );

  const results = await Promise.all(searchPromises);

  // 合并所有搜索结果
  let allArticles: any[] = [];

  results.forEach((res, index) => {
    const account = myAccounts[index];
    if (res) {
      log.info(
        `[search-article] account="${account?.nickname}" fakeid=${account?.fakeid} ret=${res.base_resp?.ret} has_publish_page=${!!res.publish_page}`,
      );
      const articles = parseArticlesFromResponse(res, account?.nickname || '未知公众号');
      log.info(`[search-article] account="${account?.nickname}" parsed ${articles.length} articles`);
      allArticles = allArticles.concat(articles);
    } else {
      log.info(`[search-article] account="${account?.nickname}" fakeid=${account?.fakeid} response=null`);
    }
  });

  // 按发布时间排序（最新的在前）
  allArticles.sort((a, b) => {
    const timeA = new Date(a.create_time).getTime();
    const timeB = new Date(b.create_time).getTime();
    return timeB - timeA;
  });

  log.info(
    `[search-article] keyword="${keyword}" accounts=${myAccounts.length} totalResults=${allArticles.length}`,
  );

  return {
    base_resp: { ret: 0 },
    articles: allArticles,
    total: allArticles.length,
    hasMore: false,
  };
});
