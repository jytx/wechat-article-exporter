/**
 * 搜索文章接口（在已关注的公众号中搜索文章）
 */

import { getAllAccounts } from '~/server/database/account';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface SearchArticleQuery {
  begin?: number;
  size?: number;
  keyword: string;
  fakeid?: string;
  searchType?: 'all' | 'account';
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

  return proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: params,
    parseJson: true,
  }).catch(e => {
    console.error(`搜索公众号 ${fakeid} 文章失败:`, e);
    return null;
  });
}

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return {
      base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' },
      articles: [],
      accounts: [],
      total: 0,
    };
  }

  const query = getQuery<SearchArticleQuery>(event);
  const keyword = query.keyword;
  const fakeid = query.fakeid;
  const searchType = query.searchType || 'all';

  // 验证搜索关键词
  if (!isValidKeyword(keyword)) {
    return {
      base_resp: {
        ret: -1,
        err_msg: '搜索关键词无效，请输入有效的文章标题关键字',
      },
      articles: [],
      accounts: [],
      total: 0,
    };
  }

  const begin: number = query.begin || 0;
  const size: number = query.size || 20;

  // 如果指定了 fakeid 或 searchType 为 'account'，直接搜索该公众号下的文章
  if (fakeid || searchType === 'account') {
    const targetFakeid = fakeid || '';
    const res = await searchArticlesInAccount(event, token, targetFakeid, keyword, begin, size);

    if (!res) {
      return {
        base_resp: {
          ret: -1,
          err_msg: '搜索文章接口失败，请重试',
        },
        articles: [],
        total: 0,
      };
    }

    if (res.base_resp?.ret === 0) {
      const publish_page = JSON.parse(res.publish_page);
      const account = await getAllAccounts().then(accounts => accounts.find(a => a.fakeid === targetFakeid));

      const articles = publish_page.publish_list
        .filter((item: any) => !!item.publish_info)
        .flatMap((item: any) => {
          const publish_info = JSON.parse(item.publish_info);
          return publish_info.appmsgex;
        })
        .map((article: any) => ({
          ...article,
          account_nickname: account?.nickname || '未知公众号',
          title: decodeHtmlEntities(article.title),
          create_time_formatted: formatTimestamp(article.create_time),
        }));

      return {
        base_resp: { ret: 0 },
        articles: articles,
        accounts: [],
        total: publish_page.total_count,
      };
    }

    return {
      base_resp: res.base_resp,
      articles: [],
      total: 0,
    };
  }

  // 获取用户已关注的公众号列表
  const myAccounts = await getAllAccounts();

  if (!myAccounts || myAccounts.length === 0) {
    return {
      base_resp: {
        ret: -1,
        err_msg: '请先添加公众号后再搜索文章',
      },
      articles: [],
      accounts: [],
      total: 0,
    };
  }

  // 在所有关注的公众号中并发搜索文章
  // 创建 fakeid -> account 的映射
  const accountMap = new Map(myAccounts.map(acc => [acc.fakeid, acc]));

  const searchPromises = myAccounts.map(account =>
    searchArticlesInAccount(event, token, account.fakeid, keyword, 0, 10)
  );

  const results = await Promise.all(searchPromises);

  // 合并所有搜索结果
  let allArticles: any[] = [];
  let totalCount = 0;

  results.forEach((res, index) => {
    if (res && res.base_resp?.ret === 0) {
      const publish_page = JSON.parse(res.publish_page);
      const account = myAccounts[index];

      const articles = publish_page.publish_list
        .filter((item: any) => !!item.publish_info)
        .flatMap((item: any) => {
          const publish_info = JSON.parse(item.publish_info);
          return publish_info.appmsgex;
        })
        .map((article: any) => ({
          ...article,
          account_nickname: account?.nickname || '未知公众号',
          title: decodeHtmlEntities(article.title),
          create_time_formatted: formatTimestamp(article.create_time),
        }));

      allArticles = allArticles.concat(articles);
      totalCount += publish_page.total_count || 0;
    }
  });

  // 按发布时间排序（最新的在前）
  allArticles.sort((a, b) => {
    const timeA = new Date(a.create_time).getTime();
    const timeB = new Date(b.create_time).getTime();
    return timeB - timeA;
  });

  // 分页处理
  const startIndex = begin * size;
  const endIndex = startIndex + size;
  const paginatedArticles = allArticles.slice(startIndex, endIndex);

  return {
    base_resp: { ret: 0 },
    articles: paginatedArticles,
    accounts: [],
    total: allArticles.length,
    hasMore: endIndex < allArticles.length,
  };
});
