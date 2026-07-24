/**
 * 用户管理模块
 */

export interface User {
  id: string;
  username: string;
  password: string; // bcrypt hash
  role: 'admin' | 'user';
  created_at: number;
  updated_at: number;
}

// 默认用户
export const defaultUsers: User[] = [
  {
    id: 'admin_001',
    username: 'admin',
    password: '$2b$10$jEIT6ApAXoAur9cAJx0WfOUZv9uOGo1hAviqhT7ifvrxWWh4B6MWy', // "admin"
    role: 'admin',
    created_at: 1680307200000,
    updated_at: 1680307200000,
  },
];

/**
 * 根据用户名查找用户
 */
export function findUserByUsername(username: string): User | undefined {
  return defaultUsers.find(u => u.username === username);
}

/**
 * 验证密码
 */
export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  try {
    const bcrypt = await import('bcrypt');
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    log.error('密码验证失败:', error);
    return false;
  }
}

/**
 * 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const bcrypt = await import('bcrypt');
    return await bcrypt.hash(password, 10);
  } catch (error) {
    log.error('密码哈希失败:', error);
    throw error;
  }
}

/**
 * 验证用户名格式
 */
export function isValidUsername(username: string): boolean {
  // 用户名必须是 4-20 位字母、数字或下划线
  const regex = /^[a-zA-Z0-9_]{4,20}$/;
  return regex.test(username);
}

/**
 * 验证密码强度
 */
export function isValidPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('密码长度至少 8 位');
  }

  if (password.length > 50) {
    errors.push('密码长度不能超过 50 位');
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含字母');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含数字');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 生成用户 ID
 */
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
