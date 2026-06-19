/**
 * 文章指标采集提醒
 *
 * 阅读量等指标内嵌在文章页的 JS 中，需要 credentials（pass_ticket/wap_sid2）
 * 才能获取真实数值，因此无法在服务端无人值守地采集。
 *
 * 真正的采集由前端「热文榜」页面的「刷新指标」按钮驱动：
 *   客户端 useDownloader → 抓取带 credentials 的文章页 → 解析阅读量 → 上报到 /metrics/upsert
 *
 * 本插件仅作占位，保留后续扩展（如服务端凭证可用时再启用定时采集）。
 */

export default defineNitroPlugin(() => {
  console.log('[metrics-scheduler] 指标采集为客户端驱动模式（热文榜页面手动触发），无服务端定时任务');
});
