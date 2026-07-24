/**
 * 搜索所有微信文章（不限公众号）
 */

import { USER_AGENT } from '~/config';
import { getCookieFromStore, getTokenFromStore } from '~/server/utils/CookieStore';
import { log } from '~/server/utils/log';

interface SearchAllArticlesBody {
  keyword: string;
  begin?: number;
  count?: number;
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
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, entity => entities[entity] || entity);
}

/**
 * 判断文章是否为中文或英文内容（过滤掉维吾尔文、藏文、阿拉伯文等）。
 * 规则：标题里若含「其他文字字符」（阿拉伯/西里尔/藏/缅/泰等字母），
 * 且这些字符占比明显，则视为非中英文文章。
 */
function isLikelyChineseOrEnglishArticle(article: any): boolean {
  const title = (article.title || '') as string;
  if (!title.trim()) return true; // 空标题不过滤

  // 其他文字字符范围：阿拉伯、西里尔(俄文)、藏文、泰文、缅文、天城文等
  // 参考 Unicode 区块，这些语言用非 CJK/非拉丁字母
  const otherScriptRe =
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0400-\u04FF\u0500-\u052F\u0F00-\u0FFF\u0E00-\u0E7F\u1000-\u109F\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0E80-\u0EFF]/g;

  const otherMatches = title.match(otherScriptRe);
  const otherCount = otherMatches ? otherMatches.length : 0;

  // 如果其他文字字符 >= 2 个，认为是非中英文文章（中文/英文标题里几乎不会出现这些）
  // 阈值 2 是为了允许偶发的特殊符号，但连续的其他语言字母会命中
  return otherCount < 2;
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

  try {
    const body = await readBody<SearchAllArticlesBody>(event);
    const keyword = body.keyword;
    const begin = body.begin || 0;
    const count = body.count || 20;

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

    const timestamp = Date.now();
    const random = Math.random();

    // 构建请求数据
    const requestData = new URLSearchParams();
    requestData.append('token', token);
    requestData.append('lang', 'zh_CN');
    requestData.append('f', 'json');
    requestData.append('ajax', '1');
    requestData.append('sub', 'check_appmsg_copyright_stat');
    requestData.append('fingerprint', `b0f86a226dcc3c02c01a54bc1ac4fef6`);
    requestData.append('random', String(random));
    requestData.append('url', keyword);
    requestData.append('allow_reprint', '0');
    requestData.append('begin', String(begin));
    requestData.append('count', String(count));

    // 获取 cookie
    const cookie = await getCookieFromStore(event);

    // 构建自定义请求头
    const headers: Record<string, string> = {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,und;q=0.7',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      cookie: cookie || '',
      origin: 'https://mp.weixin.qq.com',
      pragma: 'no-cache',
      referer: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${token}&lang=zh_CN&timestamp=${timestamp}`,
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
    };

    // 直接发送请求
    const fetchResponse = await fetch('https://mp.weixin.qq.com/cgi-bin/operate_appmsg', {
      method: 'POST',
      headers: headers,
      body: requestData.toString(),
    });

    const response = await fetchResponse.json();

    if (response.base_resp?.ret === 0) {
      // 处理返回的文章数据
      let articles: any[] = [];

      if (response.list && Array.isArray(response.list)) {
        articles = response.list
          .filter((article: any) => isLikelyChineseOrEnglishArticle(article))
          .map((article: any) => {
          // 确保 URL 使用 HTTPS
          let url = article.url || '';
          if (url.startsWith('http://')) {
            url = url.replace('http://', 'https://');
          }

          return {
            aid: url || '', // 使用 url 作为唯一标识
            appmsgid: url || '',
            title: decodeHtmlEntities(article.title || ''),
            account_nickname: article.nickname || '未知公众号',
            // 微信版权查询接口不返回发布时间，留空不显示（避免误导）
            create_time: 0,
            create_time_formatted: '',
            cover: article.cover_url || '',
            cover_url_1_1: article.cover_url_1_1 || '',
            pic_cdn_url_1_1: article.cover_url_1_1 || '',
            digest: article.digest || '',
            link: url || '',
            author: article.author || '',
            head_img_url: article.head_img_url || '',
            // 保留原始数据
            _raw: article,
          };
        });
      }

      const totalReturned = response.total || articles.length;
      // hasMore 判断：用"已加载范围 < 总数"，而不是"单次返回 >= count"。
      // 微信接口单次返回数经常少于 count（如请求 20 实际返回 18），
      // 用 returned>=count 会误判为没有更多了。
      const hasMore = begin + articles.length < totalReturned;

      log.info(
        `[search-all-articles] keyword="${keyword}" begin=${begin} count=${count} returned=${articles.length} total=${totalReturned} hasMore=${hasMore}`,
      );

      return {
        base_resp: { ret: 0 },
        articles: articles,
        total: totalReturned,
        hasMore: hasMore,
      };
    } else {
      return {
        base_resp: response.base_resp || { ret: -1, err_msg: '搜索失败' },
        articles: [],
        total: 0,
      };
    }
  } catch (error: any) {
    log.error('搜索所有文章失败:', error);
    return {
      base_resp: {
        ret: -1,
        err_msg: error.message || '搜索失败，请重试',
      },
      articles: [],
      total: 0,
    };
  }
});
