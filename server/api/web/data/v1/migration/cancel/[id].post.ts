/**
 * 取消迁移
 * POST /api/web/data/v1/migration/cancel/:id
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

    // 检查迁移状态
    if (migration.status === 'completed') {
      throw createError({
        statusCode: 400,
        message: '迁移已完成，无法取消'
      });
    }

    if (migration.status === 'cancelled') {
      return {
        success: true,
        message: '迁移已被取消'
      };
    }

    // 更新迁移状态为已取消
    migration.status = 'cancelled';
    migration.completed_at = new Date().toISOString();

    await kv.set(`migration:${migrationId}`, migration);

    return {
      success: true,
      message: '迁移已取消',
      data: migration
    };

  } catch (error) {
    // 如果是已知的错误，直接抛出
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    log.error('取消迁移失败:', error);
    throw createError({
      statusCode: 500,
      message: '取消迁移失败'
    });
  }
});
