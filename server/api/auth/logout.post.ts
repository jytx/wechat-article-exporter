/**
 * 用户登出 API
 * POST /api/auth/logout
 */

export default defineEventHandler(async (event) => {
  try {
    // 删除 Session
    await deleteSession(event);

    return {
      success: true,
      message: '登出成功'
    };

  } catch (error) {
    console.error('登出失败:', error);
    throw createError({
      statusCode: 500,
      message: '登出失败，请稍后重试'
    });
  }
});
