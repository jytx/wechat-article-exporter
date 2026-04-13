/**
 * 公众号数据存储管理
 * 使用 Nuxt Storage (文件系统驱动)
 */

export interface MpAccountKV {
  fakeid: string;
  nickname: string;
  alias?: string;
  round_head_img?: string;
  signature?: string;
  // 文章总数
  total_count: number;
  // 已同步文章数
  synced_count: number;
  // 创建时间
  create_time: number;
  // 最后更新时间
  update_time: number;
}

/**
 * 保存或更新公众号信息
 */
export async function saveAccount(account: MpAccountKV): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const key = `account:${account.fakeid}`;
    const existing = await kv.get<MpAccountKV>(key);

    if (existing) {
      // 更新现有记录
      await kv.set(key, {
        ...existing,
        ...account,
        update_time: Math.round(Date.now() / 1000),
      });
    } else {
      // 新建记录
      await kv.set(key, {
        ...account,
        create_time: Math.round(Date.now() / 1000),
        update_time: Math.round(Date.now() / 1000),
      });
    }
    return true;
  } catch (err) {
    console.error('saveAccount failed:', err);
    return false;
  }
}

/**
 * 获取公众号信息
 */
export async function getAccount(fakeid: string): Promise<MpAccountKV | null> {
  const kv = useStorage('kv');
  try {
    return await kv.get<MpAccountKV>(`account:${fakeid}`);
  } catch (err) {
    console.error('getAccount failed:', err);
    return null;
  }
}

/**
 * 获取所有公众号列表
 */
export async function getAllAccounts(): Promise<MpAccountKV[]> {
  const kv = useStorage('kv');
  try {
    // 获取所有 account keys
    const keys = await kv.getKeys('account:');

    const accounts: MpAccountKV[] = [];
    for (const key of keys) {
      const account = await kv.get<MpAccountKV>(key);
      if (account) {
        accounts.push(account);
      }
    }

    // 按更新时间排序
    return accounts.sort((a, b) => b.update_time - a.update_time);
  } catch (err) {
    console.error('getAllAccounts failed:', err);
    return [];
  }
}

/**
 * 删除公众号
 */
export async function deleteAccount(fakeid: string): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    await kv.remove(`account:${fakeid}`);
    return true;
  } catch (err) {
    console.error('deleteAccount failed:', err);
    return false;
  }
}

/**
 * 更新公众号文章总数
 */
export async function updateAccountTotalCount(fakeid: string, totalCount: number): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const account = await kv.get<MpAccountKV>(`account:${fakeid}`);
    if (account) {
      account.total_count = totalCount;
      account.update_time = Math.round(Date.now() / 1000);
      await kv.set(`account:${fakeid}`, account);
      return true;
    }
    return false;
  } catch (err) {
    console.error('updateAccountTotalCount failed:', err);
    return false;
  }
}

/**
 * 更新公众号文章同步数量
 */
export async function updateAccountSyncedCount(fakeid: string, count: number): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    const account = await kv.get<MpAccountKV>(`account:${fakeid}`);
    if (account) {
      account.synced_count = count;
      account.update_time = Math.round(Date.now() / 1000);
      await kv.set(`account:${fakeid}`, account);
      return true;
    }
    return false;
  } catch (err) {
    console.error('updateAccountSyncedCount failed:', err);
    return false;
  }
}
