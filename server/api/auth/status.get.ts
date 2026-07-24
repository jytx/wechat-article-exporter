/**
 * 检查登录状态 API
 * GET /api/auth/status
 */

export default defineEventHandler(async event => {
  try {
    // 获取 Session
    const session = await getUserSession(event);

    if (!session || !session.user) {
      return {
        success: true,
        data: {
          authenticated: false,
          user: null,
        },
      };
    }

    // 检查 Session 是否过期
    const { isSessionExpired } = await import('~/server/utils/session');

    if (isSessionExpired(session)) {
      await deleteSession(event);

      return {
        success: true,
        data: {
          authenticated: false,
          user: null,
        },
      };
    }

    // 更新最后活跃时间
    const { updateSessionActivity } = await import('~/server/utils/session');
    const updatedSession = updateSessionActivity(session);
    await updatedSession.save();

    return {
      success: true,
      data: {
        authenticated: true,
        user: {
          id: session.user.id,
          username: session.user.username,
          role: session.user.role,
        },
      },
    };
  } catch (error) {
    log.error('检查登录状态失败:', error);

    // 出错时返回未认证状态
    return {
      success: true,
      data: {
        authenticated: false,
        user: null,
      },
    };
  }
});
