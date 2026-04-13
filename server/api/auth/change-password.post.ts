/**
 * 修改密码 API
 * POST /api/auth/change-password
 */

interface ChangePasswordBody {
  old_password: string;
  new_password: string;
}

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const session = await getSession(event);

    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: '未认证'
      });
    }

    const body = await readBody<ChangePasswordBody>(event);
    const { old_password, new_password } = body;

    // 参数验证
    if (!old_password || !new_password) {
      throw createError({
        statusCode: 400,
        message: '旧密码和新密码不能为空'
      });
    }

    // 导入相关函数
    const {
      findUserByUsername,
      verifyPassword,
      hashPassword,
      isValidPassword
    } = await import('~/server/utils/users');

    // 查找用户
    const user = findUserByUsername(session.user.username);

    if (!user) {
      throw createError({
        statusCode: 404,
        message: '用户不存在'
      });
    }

    // 验证旧密码
    const isOldPasswordValid = await verifyPassword(old_password, user.password);

    if (!isOldPasswordValid) {
      throw createError({
        statusCode: 400,
        message: '旧密码错误'
      });
    }

    // 检查新密码是否与旧密码相同
    const isSamePassword = await verifyPassword(new_password, user.password);

    if (isSamePassword) {
      throw createError({
        statusCode: 400,
        message: '新密码不能与旧密码相同'
      });
    }

    // 验证新密码强度
    const passwordValidation = isValidPassword(new_password);

    if (!passwordValidation.valid) {
      throw createError({
        statusCode: 400,
        message: passwordValidation.errors.join('; ')
      });
    }

    // 哈希新密码
    const hashedPassword = await hashPassword(new_password);

    // 更新用户密码
    user.password = hashedPassword;
    user.updated_at = Date.now();

    // 注意：这里只是更新了内存中的用户对象
    // 生产环境应该将更新保存到数据库或文件

    return {
      success: true,
      message: '密码修改成功'
    };

  } catch (error) {
    // 如果是已知的错误，直接抛出
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    // 未知错误
    console.error('修改密码失败:', error);
    throw createError({
      statusCode: 500,
      message: '修改密码失败，请稍后重试'
    });
  }
});
