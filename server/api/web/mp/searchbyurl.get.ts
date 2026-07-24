/**
 * 通过 URL 搜索公众号
 * GET /api/web/mp/searchbyurl?url=xxx
 *
 * 支持两种 URL 格式：
 * 1. 公众号主页：profile_ext?action=home&__biz=xxx
 *    → 直接从 URL 参数提取 __biz
 * 2. 文章 URL：mp.weixin.qq.com/s/xxx 或 ?__biz=xxx&mid=xxx
 *    → 长格式直接有 __biz；短链 /s/xxx 需 fetch HTML 从中提取 __biz
 *
 * 拿到 __biz（=fakeid）后，用公众号名搜 searchbiz 再用 fakeid 精确匹配拿完整信息。
 */

import * as cheerio from 'cheerio';
import { USER_AGENT } from '~/config';
import { log } from '~/server/utils/log';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface UrlQuery {
  url: string;
}

/** 允许服务端请求的微信域名白名单 */
const ALLOWED_HOSTS = new Set(['mp.weixin.qq.com', 'weixin.qq.com']);

/** 验证 URL 是否为允许的微信域名（纯函数） */
function isAllowedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** 从 URL query 参数中提取 __biz（纯函数） */
function extractBizFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).searchParams.get('__biz');
  } catch {
    return null;
  }
}

/** 从文章 HTML 中提取 __biz/fakeid（纯函数，多模式匹配） */
function extractBizFromHtml(html: string): string | null {
  // 模式1：URL 参数格式 __biz=xxx
  const patterns = [
    /__biz=([A-Za-z0-9%+=]+)/,
    // 模式2：JS 赋值格式 "biz":"xxx" 或 biz = "xxx"
    /["']?biz["']?\s*[:=]\s*["']([A-Za-z0-9%+=]+)["']/,
    // 模式3：JS 赋值格式 "fakeid":"xxx" 或 fakeid = "xxx"
    /["']?fakeid["']?\s*[:=]\s*["']([A-Za-z0-9%+=]+)["']/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

/** 从公众号主页 URL（profile_ext）获取公众号名称，用于 searchbiz 搜索 */
async function getNameFromProfileHtml(biz: string): Promise<string | null> {
  const profileUrl = `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${encodeURIComponent(biz)}`;
  try {
    const html = await fetch(profileUrl, {
      headers: { Referer: 'https://mp.weixin.qq.com/', Origin: 'https://mp.weixin.qq.com', 'User-Agent': USER_AGENT },
      redirect: 'error',
    }).then(res => res.text());
    const $ = cheerio.load(html);
    return $('.wx_follow_nickname:first').text().trim() || null;
  } catch {
    return null;
  }
}

/** 从文章 URL 获取公众号名称（fetch HTML，优先用 nickname JS 变量） */
async function getNameFromArticleHtml(articleUrl: string): Promise<string | null> {
  try {
    const html = await fetch(articleUrl, {
      headers: { Referer: 'https://mp.weixin.qq.com/', Origin: 'https://mp.weixin.qq.com', 'User-Agent': USER_AGENT },
      redirect: 'error',
    }).then(res => res.text());

    // 优先用 nickname JS 变量（这是真正的公众号名，og:article:author 只是文章作者名，可能不同）
    const nickMatch = html.match(/["']?nickname["']?\s*[:=]\s*["']([^"']+)["']/);
    if (nickMatch) return nickMatch[1];

    // 降级：cheerio 解析 wx_follow_nickname
    const $ = cheerio.load(html);
    const nick = $('.wx_follow_nickname:first').text().trim();
    if (nick) return nick;

    // 最后降级：og:article:author（不一定是公众号名，但总比没有强）
    const ogAuthor = $('meta[property="og:article:author"]').attr('content');
    return ogAuthor || null;
  } catch {
    return null;
  }
}

export default defineEventHandler(async event => {
  let { url } = getQuery<UrlQuery>(event);
  if (!url) {
    return { base_resp: { ret: -1, err_msg: '缺少 url 参数' } };
  }
  url = decodeURIComponent(url);

  if (!isAllowedUrl(url)) {
    return { base_resp: { ret: -1, err_msg: '不允许的 URL：仅支持微信公众平台域名' } };
  }

  // ===== 第1步：提取 __biz（=fakeid）=====
  let biz = extractBizFromUrl(url);

  // 短链 /s/xxx 没有 __biz，需要 fetch HTML 提取
  if (!biz) {
    log.info('[searchbyurl] URL 无 __biz 参数，fetch HTML 提取...');
    try {
      const html = await fetch(url, {
        headers: { Referer: 'https://mp.weixin.qq.com/', 'User-Agent': USER_AGENT },
        redirect: 'error',
      }).then(res => res.text());
      biz = extractBizFromHtml(html);
    } catch (e: any) {
      log.error(`[searchbyurl] HTML 提取 __biz 失败: ${e?.message}`);
    }
  }

  if (!biz) {
    return { base_resp: { ret: -1, err_msg: '无法从 URL 解析公众号信息（缺少 __biz）' } };
  }

  log.info(`[searchbyurl] __biz=${biz}，获取公众号名用于搜索...`);

  // ===== 第2步：获取公众号名（用于 searchbiz 搜索）=====
  let name: string | null = null;
  if (url.includes('profile_ext')) {
    name = await getNameFromProfileHtml(biz);
  } else {
    name = await getNameFromArticleHtml(url);
  }

  if (!name) {
    // 没拿到名字，无法搜索，但有 __biz，返回最小信息
    return {
      base_resp: { ret: 0 },
      list: [{ fakeid: biz, nickname: '', alias: '', round_head_img: '', signature: '' }],
      total: 1,
    };
  }

  // ===== 第3步：用名字搜 searchbiz，再用 fakeid 精确匹配拿完整信息 =====
  const token = await getTokenFromStore(event);
  if (!token) {
    return { base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' } };
  }

  log.info(`[searchbyurl] 用名称「${name}」搜索，匹配 fakeid=${biz}`);

  const searchResp = await proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
    query: { action: 'search_biz', begin: 0, count: 20, query: name, token, lang: 'zh_CN', f: 'json', ajax: '1' },
    parseJson: true,
  });

  if (searchResp.base_resp?.ret !== 0) {
    return searchResp;
  }

  // 用 fakeid 精确匹配（比名字匹配更可靠）
  const matched = searchResp.list.filter((item: any) => item.fakeid === biz);
  if (matched.length > 0) {
    return { base_resp: { ret: 0 }, list: matched, total: matched.length };
  }

  // fakeid 没匹配到，降级用名字匹配
  const nameMatched = searchResp.list.filter((item: any) => item.nickname === name);
  if (nameMatched.length > 0) {
    return { base_resp: { ret: 0 }, list: nameMatched, total: nameMatched.length };
  }

  // searchbiz 没搜到精确匹配的，但已有 __biz 和名称，直接用这些信息返回
  // 头像/简介等后续可通过「同步信息」按钮补全
  log.info(`[searchbyurl] searchbiz 未匹配到，使用解析到的 biz=${biz} 名称=${name} 直接返回`);
  return {
    base_resp: { ret: 0 },
    list: [{ fakeid: biz, nickname: name, alias: '', round_head_img: '', signature: '' }],
    total: 1,
  };
});
