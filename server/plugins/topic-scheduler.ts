/**
 * AI 选题定时调度
 *
 * 服务启动时读取 topic_schedule 配置，若启用则按 cron 定时触发 startTopicTask('schedule')。
 * 配置变更（topic/config.put）时调用 rescheduleTopicJob 重新调度。
 *
 * 说明：node-cron 依赖 Node 运行时，在 Cloudflare Pages preset 下不可用；
 * 本项目目标部署为自有服务器 / Docker，定时任务可用。
 * 若未来部署到 CF，应改用外部 cron 调用 POST /api/web/data/v1/topic/generate。
 */

import cron from 'node-cron';
import { getAllSettings } from '~/server/database/settings';
import { startTopicTask } from '~/server/utils/topic-task-manager';

let currentJob: cron.ScheduledTask | null = null;

function parseScheduleConfig(): { enabled: boolean; cron: string } {
  const settings = getAllSettings();
  let enabled = false;
  let cronExpr = '0 9 * * *';
  try {
    const cfg = settings.topic_schedule ? JSON.parse(settings.topic_schedule) : {};
    enabled = cfg.enabled === true;
    if (typeof cfg.cron === 'string' && cfg.cron.trim()) cronExpr = cfg.cron.trim();
  } catch {
    // 用默认值
  }
  return { enabled, cron: cronExpr };
}

/**
 * 重新调度定时任务（配置变更后调用）。
 * 先销毁旧任务，再按新配置创建。
 */
export function rescheduleTopicJob(enabled: boolean, cronExpr: string): boolean {
  // 先停掉旧的
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  if (!enabled) {
    console.log('[topic-scheduler] 已禁用定时选题');
    return true;
  }

  // 校验 cron 表达式合法性
  if (!cron.validate(cronExpr)) {
    console.error(`[topic-scheduler] cron 表达式非法: ${cronExpr}，跳过调度`);
    return false;
  }

  currentJob = cron.schedule(cronExpr, () => {
    console.log(`[topic-scheduler] 定时触发选题生成 ${new Date().toISOString()}`);
    startTopicTask('schedule');
  });

  console.log(`[topic-scheduler] 已启用定时选题：${cronExpr}`);
  return true;
}

export default defineNitroPlugin(() => {
  const { enabled, cron: cronExpr } = parseScheduleConfig();
  rescheduleTopicJob(enabled, cronExpr);
});
