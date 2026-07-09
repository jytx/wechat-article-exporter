/**
 * 同步公众号的最新信息（名称、头像、简介、微信号等）
 * POST /api/web/data/v1/batch/sync-account-info
 *
 * Body: { fakeids?: string[] }
 *   fakeids - 指定要同步的公众号 fakeid 列表；不传则同步全部
 *
 * 用微信 searchbiz 接口（按名称搜索）拉取最新的 nickname/alias/round_head_img/signature。
 * total_count/synced_count 以本地 articles 表实际数量为准。
 * 依赖微信登录态。
 */
import { getAllAccounts, saveAccount } from '~/server/database/account';
import { getCookieFromStore, getTokenFromStore } from '~/server/utils/CookieStore';
import { successResponse } from '~/server/utils/api-response';
import { getDatabase } from '~/server/utils/database';
import { USER_AGENT } from '~/config';

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return successResponse({ error: '未登录' }, '未登录或登录已过期，请扫码登录');
  }
  const cookie = await getCookieFromStore(event);

  const body = await readBody<{ fakeids?: string[] }>(event).catch(() => ({}));

  let accounts = await getAllAccounts();
  // 如果传了 fakeids，只同步指定的
  if (Array.isArray(body.fakeids) && body.fakeids.length > 0) {
    const idSet = new Set(body.fakeids);
    accounts = accounts.filter(a => idSet.has(a.fakeid));
  }

  if (accounts.length === 0) {
    return successResponse({ updated: 0 }, '没有选中的公众号');
  }

  const db = getDatabase();
  let updated = 0;
  let failed = 0;
  const results: { nickname: string; ok: boolean; reason?: string }[] = [];

  for (const acc of allAccounts) {
    try {
      // 用公众号名搜 searchbiz
      const params = new URLSearchParams({
        action: 'search_biz',
        begin: '0',
        count: '5',
        query: acc.nickname,
        token,
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
      });
      const res = await fetch(`https://mp.weixin.qq.com/cgi-bin/searchbiz?${params}`, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://mp.weixin.qq.com/',
          Origin: 'https://mp.weixin.qq.com',
          cookie: cookie || '',
        },
      });
      const data = await res.json();

      if (data.base_resp?.ret !== 0) {
        failed++;
        results.push({ nickname: acc.nickname, ok: false, reason: `微信返回 ret=${data.base_resp?.ret}` });
        continue;
      }

      const list = data.list || [];
      // 优先匹配 fakeid，其次匹配昵称
      const matched = list.find((b: any) => b.fakeid === acc.fakeid) || list[0];
      if (!matched) {
        failed++;
        results.push({ nickname: acc.nickname, ok: false, reason: '搜索无结果' });
        continue;
      }

      // 统计本地实际文章数
      const countRow = db
        .prepare('SELECT COUNT(*) AS c FROM articles WHERE fakeid = ? AND is_deleted = 0')
        .get(acc.fakeid) as { c: number };

      // 更新公众号信息（保留 create_time，更新其余字段）
      await saveAccount({
        fakeid: acc.fakeid,
        nickname: matched.nickname || acc.nickname,
        alias: matched.alias || acc.alias || '',
        round_head_img: matched.round_head_img || acc.round_head_img || '',
        signature: matched.signature || acc.signature || '',
        total_count: countRow.c,
        synced_count: countRow.c,
        create_time: acc.create_time,
        update_time: Math.floor(Date.now() / 1000),
      });

      updated++;
      results.push({ nickname: acc.nickname, ok: true });
      console.log(`[sync-account-info] ${acc.nickname}: 信息已更新（头像: ${matched.round_head_img ? '有' : '无'}）`);

      // 防限流
      await new Promise(r => setTimeout(r, 1500));
    } catch (e: any) {
      failed++;
      results.push({ nickname: acc.nickname, ok: false, reason: e?.message });
      console.error(`[sync-account-info] ${acc.nickname} 失败:`, e?.message);
    }
  }

  return successResponse(
    { updated, failed, total: allAccounts.length, results },
    `公众号信息同步完成：成功 ${updated}，失败 ${failed}`
  );
});
