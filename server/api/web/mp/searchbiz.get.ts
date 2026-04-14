/**
 * 搜索公众号接口
 */

import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface SearchBizQuery {
  begin?: number;
  size?: number;
  keyword: string;
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

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return { base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' } };
  }

  const query = getQuery<SearchBizQuery>(event);
  const keyword = query.keyword;

  // 验证搜索关键词
  if (!isValidKeyword(keyword)) {
    return {
      base_resp: {
        ret: -1,
        err_msg: '搜索关键词无效，请输入有效的公众号名称或微信号',
      },
      list: [],
      total: 0,
    };
  }

  const begin: number = query.begin || 0;
  const size: number = query.size || 5;

  const params: Record<string, string | number> = {
    action: 'search_biz',
    begin: begin,
    count: size,
    query: keyword,
    token: token,
    lang: 'zh_CN',
    f: 'json',
    ajax: '1',
  };

  return proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
    query: params,
    parseJson: true,
  }).catch(e => {
    return {
      base_resp: {
        ret: -1,
        err_msg: '搜索公众号接口失败，请重试',
      },
    };
  });
});
