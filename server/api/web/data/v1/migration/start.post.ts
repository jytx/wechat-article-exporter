/**
 * 开始数据迁移
 * POST /api/web/data/v1/migration/start
 */

interface StartMigrationBody {
  indexeddb_accounts?: number;
  indexeddb_articles?: number;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<StartMigrationBody>(event);

    // 生成迁移 ID
    const migrationId = `migration_${Date.now()}`;

    // 创建迁移记录
    const migration = {
      id: migrationId,
      status: 'pending',
      progress: {
        accounts: {
          total: body.indexeddb_accounts || 0,
          migrated: 0,
          failed: 0
        },
        articles: {
          total: body.indexeddb_articles || 0,
          migrated: 0,
          failed: 0
        }
      },
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null
    };

    // 使用临时存储保存迁移状态（生产环境应使用 Redis 或数据库）
    const kv = useStorage('kv');
    await kv.set(`migration:${migrationId}`, migration);

    return {
      success: true,
      data: {
        migration_id: migrationId,
        status: 'pending',
        estimated_time: Math.max(
          (body.indexeddb_articles || 0) / 100, // 假设每秒处理 100 篇文章
          60 // 最少 1 分钟
        )
      }
    };

  } catch (error) {
    log.error('开始迁移失败:', error);
    throw createError({
      statusCode: 500,
      message: '开始迁移失败'
    });
  }
});
