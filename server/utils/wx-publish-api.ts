/**
 * 微信公众号文章列表接口（appmsgpublish）封装
 *
 * 仅负责"发请求 + 解析"，不涉及同步任务状态/数据库等业务逻辑（纯函数式）。
 * 业务侧（sync-task-manager）通过 fetchPublishPageWithRetry 获取一页数据。
 */

import { log } from '~/server/utils/log';

/** 微信公众号管理端固定 UA */
const WX_USER_AGENT: string =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 单页请求超时（毫秒）：微信接口偶尔挂起，不加超时会卡死整个串行队列 */
const REQUEST_TIMEOUT_MS = 30_000;

/** 微信业务码 */
const RET_OK = 0;
/** session 过期：需重新扫码登录，不可重试 */
const RET_SESSION_EXPIRED = 200003;
/** 频率限制（freq control）：可退避后重试 */
const RET_FREQ_CONTROL = 200013;

/** 频率限制最大重试次数 */
const FREQ_MAX_RETRY = 3;
/** 频率限制退避起始间隔（秒），每次翻倍：3 → 6 → 12 */
const FREQ_BASE_INTERVAL_SEC = 3;

/** 解析后的一页文章列表数据 */
export interface WxPublishPage {
  /** 微信报告的该公众号文章总数（仅参考） */
  totalCount: number;
  /** 本页群发消息原始列表（每条含 publish_info JSON 字符串） */
  publishList: Array<{ publish_info?: string }>;
}

/** 单页请求结果：成功携带数据，失败携带业务码供调用方决策 */
export type FetchPageResult =
  | { ok: true; page: WxPublishPage }
  | { ok: false; code: number; errMsg: string; sessionExpired: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 向微信 appmsgpublish 发起单页请求并解析为 WxPublishPage（纯函数，不含重试） */
async function requestOnce(args: {
  fakeid: string;
  begin: number;
  pageSize: number;
  token: string;
  cookie: string;
}): Promise<FetchPageResult> {
  const params = new URLSearchParams({
    sub: 'list',
    search_field: 'null',
    begin: String(args.begin),
    count: String(args.pageSize),
    fakeid: args.fakeid,
    type: '101_1',
    free_publish_type: '1',
    sub_action: 'list_ex',
    token: args.token,
    lang: 'zh_CN',
    f: 'json',
    ajax: '1',
  });

  const resp = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsgpublish?${params}`, {
    headers: {
      'User-Agent': WX_USER_AGENT,
      Referer: 'https://mp.weixin.qq.com/',
      Origin: 'https://mp.weixin.qq.com',
      cookie: args.cookie || '',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const wxData = await resp.json();
  const ret: number = wxData.base_resp?.ret ?? RET_OK;

  // session 过期：不可重试，直接返回让调用方终止任务
  if (ret === RET_SESSION_EXPIRED) {
    return { ok: false, code: ret, errMsg: 'session expired', sessionExpired: true };
  }

  // 其他非零错误码：交给调用方按是否频率限制决定重试
  if (ret !== RET_OK) {
    return {
      ok: false,
      code: ret,
      errMsg: wxData.base_resp?.err_msg || `ret=${ret}`,
      sessionExpired: false,
    };
  }

  const publishPage = wxData.publish_page ? JSON.parse(wxData.publish_page) : null;
  if (!publishPage) {
    // 正常返回但无 publish_page，视为空页
    return { ok: true, page: { totalCount: 0, publishList: [] } };
  }

  return {
    ok: true,
    page: {
      totalCount: publishPage.total_count || 0,
      publishList: publishPage.publish_list || [],
    },
  };
}

/**
 * 拉取一页文章列表，对频率限制（200013）做指数退避重试。
 *
 * - session 过期：立即返回（不可重试）
 * - 频率限制：等待后重试，间隔翻倍（3s→6s→12s），最多 3 次
 * - 其他错误：返回原始错误，调用方决定是否结束
 * - 网络/超时异常：抛出，由调用方的 try/catch 统一计入 consecutiveErrors
 *
 * @param logTag 日志前缀（如 sync-task id）
 */
export async function fetchPublishPageWithRetry(args: {
  fakeid: string;
  begin: number;
  pageSize: number;
  token: string;
  cookie: string;
  logTag: string;
}): Promise<FetchPageResult> {
  let waitSec = FREQ_BASE_INTERVAL_SEC;

  for (let attempt = 0; attempt <= FREQ_MAX_RETRY; attempt++) {
    const result = await requestOnce(args);

    if (result.ok) return result;

    // 非频率限制错误（含 session 过期）：不重试，直接返回
    if (result.code !== RET_FREQ_CONTROL) return result;

    // 已达最大重试次数，放弃
    if (attempt >= FREQ_MAX_RETRY) {
      log.warn(`[${args.logTag}] 频率限制，已重试 ${FREQ_MAX_RETRY} 次仍失败，放弃本页`);
      return result;
    }

    // 频率限制：指数退避后重试
    log.info(`[${args.logTag}] 命中频率限制（freq control），${waitSec}秒后重试（第 ${attempt + 1}/${FREQ_MAX_RETRY} 次）`);
    await sleep(waitSec * 1000);
    waitSec *= 2;
  }

  // 理论上不会走到，兜底
  return { ok: false, code: RET_FREQ_CONTROL, errMsg: 'freq control', sessionExpired: false };
}
