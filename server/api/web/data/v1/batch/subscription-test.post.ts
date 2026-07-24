/**
 * 立即触发一次文章订阅推送（测试用）
 * POST /api/web/data/v1/batch/subscription-test
 *
 * 忽略 cron 调度，直接执行一次 runSubscription。
 * 用于在设置页面验证订阅配置是否正确。
 */

import { runSubscription } from '~/server/plugins/subscription-scheduler';
import { successResponse, handleApiError } from '~/server/utils/api-response';

export default defineEventHandler(async event => {
  try {
    const result = await runSubscription();
    if (result.sent) {
      return successResponse(result, `已发送 ${result.articleCount} 篇文章`);
    }
    return successResponse(result, result.reason);
  } catch (err) {
    handleApiError(err);
  }
});
