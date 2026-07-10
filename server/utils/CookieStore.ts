import { H3Event, parseCookies } from 'h3';
import { CookieKVValue, getMpCookie, setMpCookie } from '~/server/database/cookie';

// 表示一条 set-cookie 记录的解析结果
export type CookieEntity = Record<string, string | number>;

/**
 * 关键 session cookie：微信登录态的核心标识。
 * 这些 cookie 若被微信置为 EXPIRED，说明 session 确实失效，
 * 必须覆盖旧值（让失效状态暴露），而不是像其它 cookie 那样保留旧值。
 */
const SESSION_COOKIE_NAMES = new Set([
  'slave_sid',
  'slave_sid_cert',
  'slave_user',
  'xid',
  'wuxun',
  'wxtoken',
]);

// 公众号所有的 set-cookie 解析结果
export class AccountCookie {
  private readonly _token: string;
  private _cookie: CookieEntity[];

  /**
   * @param token
   * @param cookies response.headers.getSetCookie() 的结果，是一个字符串数组
   */
  constructor(token: string, cookies: string[]) {
    this._token = token;
    this._cookie = AccountCookie.parse(cookies);
  }

  static create(token: string, cookies: CookieEntity[]): AccountCookie {
    const value = new AccountCookie(token, []);
    value._cookie = cookies;
    return value;
  }

  public toString(): string {
    return this.stringify(this._cookie);
  }

  public toJSON(): CookieKVValue {
    return {
      token: this._token,
      cookies: this._cookie,
    };
  }

  public get(name: string): CookieEntity | undefined {
    return this._cookie.find(cookie => cookie.name === name);
  }

  public get token() {
    return this._token;
  }

  // 根据 cookie 中的 expires 来确定是否已过期
  public get isExpired(): boolean {
    const now = Date.now();
    // 检查所有 cookie 的 expires_timestamp，只要有一个已过期就认为会话过期
    for (const cookie of this._cookie) {
      if (cookie.expires_timestamp && typeof cookie.expires_timestamp === 'number' && cookie.expires_timestamp < now) {
        return true;
      }
    }
    return false;
  }

  /**
   * 合并新的 set-cookie 到现有 cookie 中，新 cookie 会覆盖同名的旧 cookie。
   *
   * 关于 EXPIRED 的处理：
   * - 关键 session cookie（见 SESSION_COOKIE_NAMES）收到 EXPIRED/空值时照常覆盖，
   *   因为微信返回 EXPIRED 表示 session 确实失效，必须让这个状态暴露出来，
   *   否则旧 session cookie 会永久驻留内存，重新登录后仍被读到（曾导致 session 过期 bug）。
   * - 普通跟踪类 cookie 仍跳过 EXPIRED/空值，保留旧值。
   */
  public update(newCookies: string[]): void {
    const parsed = AccountCookie.parse(newCookies);
    const cookieMap = new Map<string, CookieEntity>();
    // 先放旧的
    for (const cookie of this._cookie) {
      if (cookie.name) {
        cookieMap.set(cookie.name as string, cookie);
      }
    }
    // 用新的覆盖
    for (const cookie of parsed) {
      if (cookie.name) {
        const name = cookie.name as string;
        const value = (cookie.value as string) || '';
        const isExpired = value.toUpperCase() === 'EXPIRED' || value === '';
        // 关键 session cookie 收到 EXPIRED 必须覆盖；普通 cookie 跳过 EXPIRED 保留旧值
        if (isExpired && !SESSION_COOKIE_NAMES.has(name)) {
          continue;
        }
        cookieMap.set(name, cookie);
      }
    }
    this._cookie = Array.from(cookieMap.values());
  }

  public static parse(cookies: string[]): CookieEntity[] {
    // key 为 cookie 的 name
    const cookieMap = new Map<string, CookieEntity>();

    for (const cookie of cookies) {
      const cookieObj: CookieEntity = {};
      // 分割 cookie 字符串为各个属性
      const parts = cookie.split(';').map(str => str.trim());

      // 第一个部分是name=value
      const [nameValue] = parts;
      if (nameValue) {
        const [name, ...valueParts] = nameValue.split('=');
        const cookieName = name.trim();
        cookieObj.name = cookieName;
        cookieObj.value = valueParts.join('=').trim(); // 处理值中可能包含的等号

        // 处理其他属性（如Expires, Path, Domain等）
        for (const part of parts.slice(1)) {
          const [key, ...valueParts] = part.split('=');
          const value = valueParts.join('=').trim(); // 处理值中可能包含的等号
          if (key) {
            const keyLower = key.toLowerCase();
            cookieObj[keyLower] = value || 'true'; // 无值属性（如HttpOnly）设为true

            // 如果是expires字段，添加时间戳
            if (keyLower === 'expires' && value) {
              try {
                const timestamp = Date.parse(value);
                if (!isNaN(timestamp)) {
                  cookieObj.expires_timestamp = timestamp; // 添加时间戳（毫秒）
                }
              } catch (e) {
                // 如果日期解析失败，忽略时间戳字段
              }
            }
          }
        }

        // Only add valid cookies to the map (overwrite if duplicate name)
        if (cookieObj.name) {
          cookieMap.set(cookieName, cookieObj);
        }
      }
    }

    return Array.from(cookieMap.values());
  }

  private stringify(parsedCookie: CookieEntity[]): string {
    return parsedCookie
      .filter(cookie => cookie.value && cookie.value !== 'EXPIRED')
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}

// 所有用户的 cookie 仓库
class CookieStore {
  // key 为 authKey, value 为 AccountCookie 实例
  // 使用 Map 的插入顺序特性实现 LRU 淘汰
  store: Map<string, AccountCookie> = new Map<string, AccountCookie>();

  // 内存缓存最大条目数，防止无限增长
  private readonly maxSize: number = 1000;

  async getAccountCookie(authKey: string): Promise<AccountCookie | null> {
    // 优先从本地内存取
    let cachedAccountCookie = this.store.get(authKey);

    if (cachedAccountCookie) {
      // LRU: 访问时将条目移到末尾（最近使用）
      this.store.delete(authKey);
      this.store.set(authKey, cachedAccountCookie);
      return cachedAccountCookie;
    }

    // 如果内存没有，则从 kv 数据库取
    const cookieValue = await getMpCookie(authKey);
    if (!cookieValue) {
      return null;
    }

    cachedAccountCookie = AccountCookie.create(cookieValue.token, cookieValue.cookies);
    this.evictIfNeeded();
    this.store.set(authKey, cachedAccountCookie);

    return cachedAccountCookie;
  }

  /**
   * 检索用户的cookie
   * @param authKey
   * @return 适合作为请求头的Cookie字符串
   */
  async getCookie(authKey: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return null;
    }
    return accountCookie.toString();
  }

  /**
   * 存储用户的cookie
   * @param authKey
   * @param token
   * @param cookie 原始的 set-cookie 字符串数组
   */
  async setCookie(authKey: string, token: string, cookie: string[]): Promise<boolean> {
    const accountCookie = new AccountCookie(token, cookie);
    // 如果已存在则先删除（保证 LRU 顺序正确）
    this.store.delete(authKey);
    this.evictIfNeeded();
    this.store.set(authKey, accountCookie);
    return await setMpCookie(authKey, accountCookie.toJSON());
  }

  /**
   * 更新用户的 cookie（合并微信响应中的新 set-cookie）
   * @param authKey
   * @param newCookies 微信响应中的 set-cookie 字符串数组
   */
  async updateCookie(authKey: string, newCookies: string[]): Promise<boolean> {
    if (!newCookies || newCookies.length === 0) {
      return true; // 无新 cookie，无需更新
    }

    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return false; // 找不到已有的 cookie 记录
    }

    // 合并新 cookie
    accountCookie.update(newCookies);

    // 持久化到 KV 数据库
    return await setMpCookie(authKey, accountCookie.toJSON());
  }

  /**
   * 移除用户的 cookie（用于登出等场景）
   * @param authKey
   */
  removeCookie(authKey: string): void {
    this.store.delete(authKey);
  }

  /**
   * 把一个 authKey 下的 cookie 迁移到另一个 authKey（用于登录后将临时 auth-key 迁移到用户固定 token）。
   *
   * 关键：同时更新内存缓存和 SQLite，避免「内存优先」读取到迁移前的旧 cookie。
   * 之前只写 SQLite 不刷内存，导致重新扫码登录后同步仍读到旧 cookie → session 过期。
   *
   * @param fromAuthKey 源 authKey（临时）
   * @param toAuthKey   目标 authKey（用户固定 token）
   * @return 是否迁移成功（源不存在则返回 false）
   */
  async migrateCookie(fromAuthKey: string, toAuthKey: string): Promise<boolean> {
    const source = await this.getAccountCookie(fromAuthKey);
    if (!source) {
      return false;
    }

    // 写入目标 authKey：内存 + SQLite 一起更新
    this.store.delete(toAuthKey);
    this.evictIfNeeded();
    this.store.set(toAuthKey, source);
    const ok = await setMpCookie(toAuthKey, source.toJSON());

    // 清理源 authKey 的内存与 SQLite，避免临时 key 残留
    this.store.delete(fromAuthKey);

    return ok;
  }

  /**
   * 当内存缓存达到上限时，淘汰最久未使用的条目
   */
  private evictIfNeeded(): void {
    while (this.store.size >= this.maxSize) {
      // Map 迭代器按插入顺序返回，第一个即为最久未使用
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * 检索用户的 token
   * @param authKey
   */
  async getToken(authKey: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return null;
    }

    return accountCookie.token;
  }

  /**
   * 转换为 json 格式，方便存储与传输
   * 返回一个对象，键为 uuid，值为解析后的 cookie 对象
   */
  toJSON(): Record<string, AccountCookie> {
    const json: Record<string, AccountCookie> = {};
    for (const [authKey, accountCookie] of this.store) {
      json[authKey] = accountCookie;
    }
    return json;
  }
}

export const cookieStore = new CookieStore();

/**
 * 从 CookieStore 中获取 cookie 字符串
 *
 * @description 根据请求中的 X-Auth-Key header 或者 auth-key cookie，从 CookieStore 中检索用户登录信息的 cookie，这些 cookie 会透传给微信
 * @param event
 */
export async function getCookieFromStore(event: H3Event): Promise<string | null> {
  let cookie: string | null = null;

  // 优先根据自定义的 X-Auth-Key 检索
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (authKey) {
    cookie = await cookieStore.getCookie(authKey);
    if (cookie) {
      return cookie;
    }
  }

  // 从 cookie 中的 token 检索
  const cookies = parseCookies(event);
  authKey = cookies['auth-key'];
  if (authKey) {
    cookie = await cookieStore.getCookie(authKey);
    if (cookie) {
      return cookie;
    }
  }

  return null;
}

/**
 * 从 CookieStore 中获取公众号的 token
 *
 * @description 根据请求中的 X-Auth-Key header 或者 auth-key cookie，从 CookieStore 中检索用户登录时绑定的 token
 * @param event
 */
export async function getTokenFromStore(event: H3Event): Promise<string | null> {
  let token: string | null = null;

  // 优先根据自定义的 X-Auth-Key 检索
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (authKey) {
    token = await cookieStore.getToken(authKey);
    if (token) {
      return token;
    }
  }

  // 从 cookie 中的 token 检索
  const cookies = parseCookies(event);
  authKey = cookies['auth-key'];
  if (authKey) {
    token = await cookieStore.getToken(authKey);
    if (token) {
      return token;
    }
  }

  return null;
}

/**
 * 从请求中获取 cookie 字符串
 *
 * @description 用于登录过程中 uuid cookie 透传给微信
 * @param event
 */
export function getCookiesFromRequest(event: H3Event): string {
  const cookies = parseCookies(event);
  return Object.keys(cookies)
    .map(key => `${key}=${encodeURIComponent(cookies[key])}`)
    .join(';');
}

/**
 * 从 response 中获取指定的 set-cookie 的 value 部分
 * @param name cookie 名
 * @param response
 */
export function getCookieFromResponse(name: string, response: Response): string | null {
  const cookies = AccountCookie.parse(response.headers.getSetCookie());
  const targetCookie = cookies.find(cookie => cookie.name === name);
  if (targetCookie) {
    return targetCookie.value as string;
  }
  return null;
}
