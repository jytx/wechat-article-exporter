import * as cheerio from 'cheerio';
import { USER_AGENT } from '~/config';
import { getCookieFromStore } from '~/server/utils/CookieStore';

interface ResolveUrlQuery {
  url: string;
}

// 允许服务端请求的微信域名白名单
const ALLOWED_HOSTS = new Set(['mp.weixin.qq.com', 'weixin.qq.com']);

/**
 * 验证 URL 是否为允许的微信域名
 */
function isAllowedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    // 只允许 https 协议
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * 解析 /s/ 格式的分享链接，返回完整的文章链接和参数
 */
export default defineEventHandler(async event => {
  let { url } = getQuery<ResolveUrlQuery>(event);
  url = decodeURIComponent(url);

  if (!isAllowedUrl(url)) {
    throw createError({
      statusCode: 400,
      message: '不允许的 URL：仅支持微信公众平台域名',
    });
  }

  try {
    console.log('[resolve-url] 开始解析链接:', url);

    // 从 CookieStore 获取登录后的 Cookie
    const wechatCookie = await getCookieFromStore(event);
    console.log('[resolve-url] 从 CookieStore 获取到的 Cookie 长度:', wechatCookie?.length || 0);

    const headers: Record<string, string> = {
      Referer: 'https://mp.weixin.qq.com/',
      Origin: 'https://mp.weixin.qq.com',
      'User-Agent': USER_AGENT,
    };

    // 如果有登录后的 Cookie，使用它
    if (wechatCookie) {
      headers.Cookie = wechatCookie;
      console.log('[resolve-url] 使用登录后的 Cookie 访问短链接');
    }

    const response = await fetch(url, {
      headers,
      redirect: 'follow', // 跟随重定向
    });

    // 首先检查最终 URL
    const finalUrl = response.url;
    console.log('[resolve-url] 重定向后的 URL:', finalUrl);

    // 如果重定向后的 URL 包含完整参数，直接返回
    if (finalUrl.includes('__biz=')) {
      const urlObj = new URL(finalUrl);
      const fakeid = urlObj.searchParams.get('__biz');
      const appmsgid = urlObj.searchParams.get('mid');
      const itemidx = urlObj.searchParams.get('idx');

      console.log('[resolve-url] ✅ 从重定向 URL 提取参数:', { fakeid, appmsgid, itemidx });

      if (fakeid && appmsgid && itemidx) {
        return {
          success: true,
          data: {
            originalUrl: url,
            fullUrl: finalUrl,
            fakeid: fakeid,
            appmsgid: Number(appmsgid),
            itemidx: Number(itemidx),
            title: '',
          },
        };
      }
    }

    // 如果重定向没有完整参数，解析 HTML
    console.log('[resolve-url] 重定向 URL 无完整参数，解析 HTML');
    const rawHtml = await response.text();
    console.log('[resolve-url] HTML 长度:', rawHtml.length);

    const $ = cheerio.load(rawHtml);

    // 从 meta 标签提取（最可靠的方法）
    const ogUrl = $('meta[property="og:url"]').attr('content');
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    console.log('[resolve-url] og:url:', ogUrl);
    console.log('[resolve-url] og:title:', ogTitle);

    if (ogUrl && ogUrl.includes('__biz=')) {
      const urlObj = new URL(ogUrl);
      const fakeid = urlObj.searchParams.get('__biz');
      const appmsgid = urlObj.searchParams.get('mid');
      const itemidx = urlObj.searchParams.get('idx');

      console.log('[resolve-url] ✅ 从 meta 标签提取参数:', { fakeid, appmsgid, itemidx, title: ogTitle });

      if (fakeid && appmsgid && itemidx) {
        return {
          success: true,
          data: {
            originalUrl: url,
            fullUrl: ogUrl,
            fakeid: fakeid,
            appmsgid: Number(appmsgid),
            itemidx: Number(itemidx),
            title: ogTitle,
          },
        };
      }
    }

    // 如果 meta 标签也没有，尝试从 canonical 链接提取
    const canonicalUrl = $('link[rel="canonical"]').attr('href');
    console.log('[resolve-url] canonical URL:', canonicalUrl);

    if (canonicalUrl && canonicalUrl.includes('__biz=')) {
      const urlObj = new URL(canonicalUrl);
      const fakeid = urlObj.searchParams.get('__biz');
      const appmsgid = urlObj.searchParams.get('mid');
      const itemidx = urlObj.searchParams.get('idx');

      console.log('[resolve-url] ✅ 从 canonical 提取参数:', { fakeid, appmsgid, itemidx });

      if (fakeid && appmsgid && itemidx) {
        return {
          success: true,
          data: {
            originalUrl: url,
            fullUrl: canonicalUrl,
            fakeid: fakeid,
            appmsgid: Number(appmsgid),
            itemidx: Number(itemidx),
            title: ogTitle,
          },
        };
      }
    }

    // 尝试从 HTML 中直接搜索 __biz 参数
    console.log('[resolve-url] 在 HTML 中搜索 __biz 参数');

    // 策略1: 尝试从 window.cgiData 中提取（最可靠）
    const cgiDataMatch = rawHtml.match(/window\.cgiData\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    if (cgiDataMatch) {
      console.log('[resolve-url] 找到 window.cgiData');
      try {
        // 清理可能的JSON问题
        const jsonStr = cgiDataMatch[1].replace(/:\s*undefined/g, ':null');
        const cgiData = JSON.parse(jsonStr);

        if (cgiData && cgiData.bizuin) {
          const fakeid = cgiData.bizuin;
          const appmsgid = cgiData.appmsgid || cgiData.mid || cgiData.appMsgInfo?.appId || '';
          const itemidx = cgiData.itemidx || cgiData.idx || cgiData.appMsgInfo?.itemIdx || 1;

          console.log('[resolve-url] ✅ 从 cgiData 提取参数:', { fakeid, appmsgid, itemidx });

          if (fakeid && appmsgid) {
            return {
              success: true,
              data: {
                originalUrl: url,
                fullUrl: url, // 使用原始链接
                fakeid: fakeid,
                appmsgid: Number(appmsgid),
                itemidx: Number(itemidx) || 1,
                title: ogTitle,
              },
            };
          }
        }
      } catch (e) {
        console.log('[resolve-url] 解析 cgiData 失败:', e.message);
      }
    }

    // 策略2: 在整个 HTML 中搜索 __biz= 格式
    const allBizMatches = rawHtml.match(/__biz=(?:")?([^&"'\s${}]+)(?:")?/g) || [];
    console.log('[resolve-url] 找到的所有 __biz 候选:', allBizMatches.slice(0, 10));

    // 从候选值中直接解析参数（最可靠的方法）
    // 候选值格式如：__biz=MzU2MTI4MjI0MQ==\x26amp;mid=2247542848\x26amp;idx=1
    let fakeid = '';
    let appmsgid = '';
    let itemidx = '';

    for (const match of allBizMatches) {
      // 跳过包含 concat 或模板字符串的
      if (match.includes('concat') || match.includes('${') || match.includes('opts.')) continue;

      // 将各种分隔符统一替换为 &，方便解析
      const normalized = match
        .replace(/\\x26amp;/g, '&')
        .replace(/\\x26/g, '&')
        .replace(/&amp;/g, '&');

      // 尝试从中提取 mid 和 idx
      const midInMatch = normalized.match(/[&?]mid=(\d+)/);
      const idxInMatch = normalized.match(/[&?]idx=(\d+)/);

      if (midInMatch && idxInMatch) {
        // 找到了！同时提取 fakeid
        const bizValue = normalized.match(/^__biz=([^&]+)/);
        if (bizValue) {
          fakeid = bizValue[1];
          appmsgid = midInMatch[1];
          itemidx = idxInMatch[1];
          console.log('[resolve-url] ✅ 从候选值直接解析成功:', { fakeid, appmsgid, itemidx });
          break;
        }
      }
    }

    // 如果候选值中没有完整的参数，单独提取 __biz
    if (!fakeid) {
      for (const match of allBizMatches) {
        const value = match.replace('__biz=', '').replace(/"/g, '');
        if (
          /^M[zt][A-Za-z0-9+/=_-]{10,30}$/.test(value) &&
          !value.includes('${') &&
          !value.includes('concat') &&
          !value.includes('(')
        ) {
          fakeid = value;
          console.log('[resolve-url] ✅ 找到有效的 fakeid:', fakeid);
          break;
        }
      }
    }

    // 如果有 fakeid 但没有 mid/idx，从 HTML 中单独提取
    if (fakeid && (!appmsgid || !itemidx)) {
      const midMatch = rawHtml.match(/["']mid["']\s*:\s*"?(\d{4,12})"?/);
      const idxMatch = rawHtml.match(/["']idx["']\s*:\s*"?(\d{1,3})"?/);
      // 也尝试匹配 mid=xxx 格式（各种编码）
      const midMatch2 = rawHtml.match(/mid=(\d{4,12})/);
      const idxMatch2 = rawHtml.match(/idx=(\d{1,3})/);
      appmsgid = midMatch?.[1] || midMatch2?.[1] || '';
      itemidx = idxMatch?.[1] || idxMatch2?.[1] || '';
    }

    console.log('[resolve-url] 最终参数:', { fakeid, appmsgid, itemidx });

    if (fakeid && appmsgid && itemidx) {
      const fullUrl = `https://mp.weixin.qq.com/s?__biz=${fakeid}&mid=${appmsgid}&idx=${itemidx}`;
      console.log('[resolve-url] ✅ 提取参数成功:', fullUrl);
      return {
        success: true,
        data: {
          originalUrl: url,
          fullUrl: fullUrl,
          fakeid: fakeid,
          appmsgid: Number(appmsgid),
          itemidx: Number(itemidx),
          title: ogTitle,
        },
      };
    }

    // 尝试从 script 标签中直接提取参数（使用正则匹配，不使用 JSON.parse）
    console.log('[resolve-url] 尝试从 script 标签提取参数');
    let foundParams: any = null;

    $('script').each((i, el) => {
      if (foundParams) return;
      const content = $(el).html() || '';

      // 尝试匹配各种参数格式
      const bizMatch = content.match(/__biz\s*[=:]\s*['"]([^'"]+)['"]/);
      const midMatch = content.match(/(?:appmsgid|mid)\s*[=:]\s*(\d+)/);
      const idxMatch = content.match(/(?:itemidx|idx)\s*[=:]\s*(\d+)/);

      if (bizMatch && midMatch && idxMatch) {
        foundParams = {
          fakeid: bizMatch[1],
          appmsgid: Number(midMatch[1]),
          itemidx: Number(idxMatch[1]),
        };
        console.log('[resolve-url] ✅ 从 script 提取参数:', foundParams);
      }
    });

    if (foundParams) {
      const fullUrl = `https://mp.weixin.qq.com/s?__biz=${foundParams.fakeid}&mid=${foundParams.appmsgid}&idx=${foundParams.itemidx}`;
      return {
        success: true,
        data: {
          originalUrl: url,
          fullUrl: fullUrl,
          fakeid: foundParams.fakeid,
          appmsgid: foundParams.appmsgid,
          itemidx: foundParams.itemidx,
          title: ogTitle,
        },
      };
    }

    console.error('[resolve-url] ❌ 无法解析完整文章参数');
    console.error('[resolve-url] 原始 URL:', url);
    console.error('[resolve-url] 重定向 URL:', finalUrl);
    console.error('[resolve-url] og:url:', ogUrl);
    console.error('[resolve-url] og:title:', ogTitle);

    // 即使无法解析完整参数，至少返回标题（部分成功）
    if (ogTitle) {
      console.log('[resolve-url] ⚠️ 部分成功：至少提取到标题');
      return {
        success: true,
        data: {
          originalUrl: url,
          fullUrl: url, // 使用原始链接
          fakeid: '',
          appmsgid: 0,
          itemidx: 1,
          title: ogTitle,
          partial: true, // 标记为部分成功
        },
      };
    }

    throw createError({
      statusCode: 400,
      message: '无法解析文章链接，请使用标准的文章链接格式',
    });
  } catch (error: any) {
    console.error('[resolve-url] ❌ 解析失败:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || '解析链接失败',
    });
  }
});
