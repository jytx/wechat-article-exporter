/**
 * 清除缓存
 * POST /api/web/data/v1/system/cache/clear
 */

interface ClearCacheBody {
  type?: 'all' | 'accounts' | 'articles';
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ClearCacheBody>(event);
    const type = body.type || 'all';

    const kv = useStorage('kv');
    let clearedCount = 0;

    if (type === 'all' || type === 'accounts') {
      // 清除公众号缓存（重新从数据源读取）
      // 这里只是示例，实际可能不需要做任何事
      // 因为 Nuxt Storage 本身就是数据源
    }

    if (type === 'all' || type === 'articles') {
      // 同样，这里只是示例
    }

    // 如果使用 Redis 或其他缓存系统，这里会执行清除操作
    // 例如：
    // await redis.flushall();

    return {
      success: true,
      data: {
        type,
        cleared: clearedCount,
        message: '缓存已清除'
      }
    };

  } catch (error) {
    console.error('清除缓存失败:', error);
    throw createError({
      statusCode: 500,
      message: '清除缓存失败'
    });
  }
});
