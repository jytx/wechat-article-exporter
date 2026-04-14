/**
 * Session 管理模块
 */

export interface SessionData {
  id: string;
  user: {
    id: string;
    username: string;
    role: 'admin' | 'user';
  };
  login_at: number;
  last_active: number;
  expires_at: number;
  ip?: string;
  user_agent?: string;
}

/**
 * Session 配置
 */
export const sessionConfig = {
  // Session 名称
  name: 'wae_session',

  // Session 密钥（h3需要password字段）
  // 注意：password 必须是非空字符串
  password: 'test-secret-password-for-development-only-change-in-production',

  // Session 过期时间（秒）
  maxAge: 7 * 24 * 60 * 60, // 7 天

  // Cookie 设置
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  },
};

/**
 * 生成 Session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * 创建 Session 数据
 */
export function createSessionData(
  user: { id: string; username: string; role: 'admin' | 'user' },
  ip?: string,
  userAgent?: string
): SessionData {
  const now = Date.now();

  return {
    id: generateSessionId(),
    user,
    login_at: now,
    last_active: now,
    expires_at: now + sessionConfig.maxAge,
    ip,
    user_agent: userAgent,
  };
}

/**
 * 检查 Session 是否过期
 */
export function isSessionExpired(session: SessionData): boolean {
  return session.expires_at < Date.now();
}

/**
 * 更新 Session 活跃时间
 */
export function updateSessionActivity(session: SessionData): SessionData {
  const now = Date.now();
  session.last_active = now;
  session.expires_at = now + sessionConfig.maxAge;
  return session;
}

/**
 * 获取用户 Session
 * 避免与 h3 的 getSession 冲突
 */
export async function getUserSession(event: H3Event<EventType>): Promise<SessionData | null> {
  const { getSession: getSessionH3, Session } = await import('h3');
  const session = await getSessionH3(event, sessionConfig);

  if (!session || !session.data) {
    return null;
  }

  // h3 Session 的 data 属性包含用户数据
  return session.data as SessionData;
}

/**
 * 创建 Session
 */
export async function createSession(event: H3Event<EventType>, sessionData: SessionData): Promise<void> {
  const { updateSession } = await import('h3');
  await updateSession(event, sessionConfig, sessionData);
}

/**
 * 删除 Session
 */
export async function deleteSession(event: H3Event<EventType>): Promise<void> {
  const { clearSession } = await import('h3');
  await clearSession(event, sessionConfig);
}
