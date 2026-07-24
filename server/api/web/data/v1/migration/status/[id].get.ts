/**
 * 查询迁移状态
 * GET /api/web/data/v1/migration/status/:id
 */

export default defineEventHandler(async (event) => {
  try {
    const migrationId = getRouterParam(event, 'id');

    if (!migrationId) {
      throw createError({
        statusCode: 400,
        message: '缺少迁移 ID'
      });
    }

    // 获取迁移记录
    const kv = useStorage('kv');
    const migration = await kv.get(`migration:${migrationId}`);

    if (!migration) {
      throw createError({
        statusCode: 404,
        message: '迁移记录不存在'
      });
    }

    return {
      success: true,
      data: migration
    };

  } catch (error) {
    // 如果是已知的错误，直接抛出
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    log.error('查询迁移状态失败:', error);
    throw createError({
      statusCode: 500,
      message: '查询迁移状态失败'
    });
  }
});
