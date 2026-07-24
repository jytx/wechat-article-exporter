<script setup lang="ts">
	import { formatTimeStamp } from '#shared/utils/helpers';
	import GlobalSearchAccountDialog from '~/components/global/SearchAccountDialog.vue';
	import BatchSearchAccounts from '~/components/dashboard/BatchSearchAccounts.vue';
	import GridAccountActions from '~/components/grid/AccountActions.vue';
	import GridLoadProgress from '~/components/grid/LoadProgress.vue';
	import ConfirmModal from '~/components/modal/Confirm.vue';
	import LoginModal from '~/components/modal/Login.vue';
	import toastFactory from '~/composables/toast';
	import useLoginCheck from '~/composables/useLoginCheck';
	import { IMAGE_PROXY, websiteName } from '~/config';
	import type { Preferences } from '~/types/preferences';
	// 新增：使用新的 API
	import { useAccountApiWithState } from '~/composables/useAccountApi';
	import type { Account } from '~/types/api';

	useHead({
	  title: `公众号管理 | ${websiteName}`,
	});

	const toast = toastFactory();
	const modal = useDialog();
	const { checkLogin } = useLoginCheck();

	// 新增：使用公众号 API
	const accountApi = useAccountApiWithState();

	const { getSyncTimestamp } = useSyncDeadline();
	const syncToTimestamp = getSyncTimestamp();

	const preferences = usePreferences();

	// 账号事件总线，用于和 Credentials 面板保持列表同步
	const { accountEventBus } = useAccountEventBus();
	accountEventBus.on(event => {
	  if (event === 'account-added' || event === 'account-removed') {
	    refresh();
	  }
	});

	const searchAccountDialogRef = ref<typeof GlobalSearchAccountDialog | null>(null);

	const addBtnLoading = ref(false);
	function addAccount() {
	  if (!checkLogin()) return;

	  searchAccountDialogRef.value!.open(false);
	}

	async function onSelectAccount(account: Account) {
	  addBtnLoading.value = true;
	  try {
	    // 使用 API 创建公众号
	    await accountApi.createAccount({
	      fakeid: account.fakeid,
	      nickname: account.nickname,
	      alias: account.alias,
	      round_head_img: account.round_head_img,
	      signature: account.signature
	    });

	    // 刷新列表
	    await refresh();

	    toast.success('公众号添加成功', `已成功添加公众号【${account.nickname}】，请点击同步按钮同步文章`);
	    // 通知 Credentials 面板按钮立即变更为"已添加"
	    accountEventBus.emit('account-added', { fakeid: account.fakeid });
	  } catch (error: any) {
	    toast.error('添加失败', error.message);
	  } finally {
	    addBtnLoading.value = false;
	  }
	}

	// ========== URL 添加公众号 ==========
	const urlModalOpen = ref(false);
	const urlInput = ref('');
	const urlAdding = ref(false);

	/** 通过 URL 解析公众号信息并添加 */
	async function addAccountByUrl() {
	  const url = urlInput.value.trim();
	  if (!url) return;
	  if (!checkLogin()) return;

	  urlAdding.value = true;
	  try {
	    const resp = await $fetch<any>('/api/web/mp/searchbyurl', {
	      query: { url },
		});

		if (resp.base_resp?.ret !== 0) {
		  toast.error('解析失败', resp.base_resp?.err_msg || '无法从 URL 解析公众号信息');
		  return;
		}

		if (!resp.list || resp.list.length === 0) {
		  toast.error('未找到', '未匹配到公众号，请检查 URL 是否正确');
		  return;
		}

		const accountInfo = resp.list[0];
		// 复用已有的添加逻辑
		await onSelectAccount({
		  fakeid: accountInfo.fakeid,
		  nickname: accountInfo.nickname,
		  alias: accountInfo.alias,
		  round_head_img: accountInfo.round_head_img,
		  signature: accountInfo.signature,
		} as Account);

		// 成功后关闭弹窗、清空输入
		urlModalOpen.value = false;
		urlInput.value = '';
	  } catch (e: any) {
	    toast.error('解析失败', e?.message || '请求失败，请重试');
	  } finally {
	    urlAdding.value = false;
	  }
	}

	// 表示同步过程中是否执行了取消操作
	const isCanceled = ref(false);
	const isDeleting = ref(false);
	const isSyncing = ref(false);

	// 当前正在同步的公众号id
	const syncingRowId = ref<string | null>(null);

	// 正在运行的后台任务（fakeid -> taskId）
	const activeSyncTasks = ref<Map<string, string>>(new Map());

	// 每个任务的服务端状态，用于 UI 区分排队/同步中/停止中
	// canceling 是纯前端状态：用户点了停止但服务端还没确认完成
	const taskStatusMap = ref<Map<string, 'pending' | 'running' | 'canceling'>>(new Map());

	/** 同步实时进度（fakeid → {synced, total, pages, message}），轮询时更新 */
	const syncProgressMap = ref<Map<string, { synced: number; total: number; pages: number; incremental: boolean; message: string }>>(new Map());

	// 所有正在同步/排队的公众号 fakeid 集合（用于批量显示同步状态）
	const syncingFakeids = computed(() => new Set(activeSyncTasks.value.keys()));

	// 轮询定时器
	const pollTimer = ref<number | null>(null);

	// 防止重复加载的标志
	const isLoading = ref(false);

	// 标记是否已经初始化完成（用于首次加载时显示加载状态）
	const isInitialized = ref(false);

	/**
	 * 启动后台同步任务并轮询进度
	 * 同步在服务端进行，切页面不中断。
	 */
	async function startBackgroundSync(
	  account: Account,
	  options: { begin?: number; deadline?: number; maxPages?: number; incremental?: boolean } = {},
	): Promise<void> {
	  if (activeSyncTasks.value.has(account.fakeid)) {
		toast.info('提示', `${account.nickname} 正在同步中`);
		return;
	  }

	  const intervalSeconds = (preferences.value as unknown as Preferences).accountSyncSeconds || 5;

	  try {
		console.log(`[sync] 启动 ${account.nickname} 的同步任务...`);
		const result = await accountApi.syncAccount(account.fakeid, {
		  ...options,
		  intervalSeconds,
		});
		console.log(`[sync] ${account.nickname} 返回:`, JSON.stringify(result));

		if (result.error) {
		  if (result.error === 'session expired' || result.error === '未登录或登录已过期') {
			modal.open(LoginModal);
		  }
		  toast.error('同步失败', result.error);
		  return;
		}

		if (result.alreadyRunning) {
		  // 该公众号已在同步队列中，记录到 activeSyncTasks 让 UI 正确显示状态
		  activeSyncTasks.value.set(account.fakeid, result.taskId);
		  taskStatusMap.value.set(account.fakeid, 'running');
		  isSyncing.value = true;
		  startPolling();
		  toast.info('提示', `${account.nickname} 已在同步队列中`);
		  return;
		}

		if (!result.taskId) {
		  toast.error('同步失败', '未获取到任务ID');
		  return;
		}

		// 记录任务，开始轮询
		activeSyncTasks.value.set(account.fakeid, result.taskId);
		taskStatusMap.value.set(account.fakeid, 'pending');
		syncingRowId.value = account.fakeid;
		isSyncing.value = true;

		startPolling();
	  } catch (e: any) {
		console.error('启动同步失败:', e);
		toast.error('同步失败', e?.message || '启动同步失败');
	  }
	}

	/**
	 * 轮询所有活跃任务的进度
	 */
	function startPolling() {
	  if (pollTimer.value) return; // 已有轮询在跑

	  pollTimer.value = window.setInterval(async () => {
	    if (activeSyncTasks.value.size === 0) {
	      stopPolling();
	      return;
	    }

		// 查询所有活跃任务状态
		const taskIds = Array.from(activeSyncTasks.value.values());
		for (const taskId of taskIds) {
		  try {
			const task = await accountApi.getSyncStatus(taskId);
			const fakeid = task.fakeid;
			console.log(`[poll] ${task.nickname}: status=${task.status} pages=${task.pagesDone} synced=${task.synced}`);

			if (task.status === 'completed' || task.status === 'failed') {
			  activeSyncTasks.value.delete(fakeid);
			  taskStatusMap.value.delete(fakeid);
			  syncProgressMap.value.delete(fakeid);
			  await updateRow(fakeid);

			  if (task.status === 'failed') {
				if (task.error === 'session expired') {
				  modal.open(LoginModal);
				}
				toast.error('同步失败', `${task.nickname}: ${task.message}`);
			  } else {
				// 取消导致的完成（非用户主动期望的"同步成功"），用 info 而非 success
				if (task.message?.includes('手动停止') || task.message?.includes('未开始')) {
				  toast.info('已停止', `${task.nickname}: ${task.message}`);
				} else {
				  toast.success('同步完成', task.message);
				}
			  }
			} else if (task.status === 'running' || task.status === 'pending') {
			  // 更新状态映射，但不要覆盖 canceling（用户已点停止，等服务端确认 completed）
			  const current = taskStatusMap.value.get(fakeid);
			  if (current !== 'canceling') {
			    taskStatusMap.value.set(fakeid, task.status);
			  }
			  // 写入实时进度（synced/total/pages），供 SyncProgress 组件展示
			  syncProgressMap.value.set(fakeid, {
			    synced: task.synced ?? 0,
			    total: task.totalWx ?? 0,
			    pages: task.pagesDone ?? 0,
			    incremental: task.incremental ?? false,
			    message: task.message ?? '',
			  });
			}
		  } catch (e) {
			console.warn('查询同步状态失败:', e);
		  }
		}

	    // 所有任务完成
	    if (activeSyncTasks.value.size === 0) {
	      stopPolling();
	      syncingRowId.value = null;
	      isSyncing.value = false;
	      // 刷新所有行
	      await refresh();
	    }
	  }, 2000);
	}

	function stopPolling() {
	  if (pollTimer.value) {
	    window.clearInterval(pollTimer.value);
	    pollTimer.value = null;
	  }
	}

	/**
	 * 取消单个公众号的同步任务。
	 *
	 * 只通知服务端取消该行的 taskId，不停止全局轮询——
	 * 轮询会继续跑，直到服务端确认任务变为 completed 后自动清除该行。
	 * 这样 UI 能正确反映"正在停止 → 已停止"的状态变化。
	 *
	 * 协作式取消：服务端 runSyncLoop 在下一页循环检查 canceled 标志后退出，
	 * 当前正在请求的那一页会跑完（最多等一个超时周期），然后停止。
	 *
	 * @param fakeid 要取消的公众号 ID（不传则取消全部）
	 */
	async function cancelSync(fakeid?: string) {
		// 确定要取消的 taskId 列表
		const taskIdsToCancel: string[] = [];
		if (fakeid) {
			// 单行取消：只取消该公众号的任务
			const taskId = activeSyncTasks.value.get(fakeid);
			if (taskId) taskIdsToCancel.push(taskId);
			// 前端立即标记为"停止中"，防止轮询把状态覆盖回 running
			taskStatusMap.value.set(fakeid, 'canceling');
		} else {
			// 全部取消（保留兼容）
			isCanceled.value = true;
			taskIdsToCancel.push(...Array.from(activeSyncTasks.value.values()));
		}

		// 通知服务端取消
		await Promise.all(
			taskIdsToCancel.map(taskId =>
				$fetch('/api/web/data/v1/batch/sync-cancel', {
					method: 'POST',
					body: { taskId },
				}).catch(() => {
					// 单个取消失败不影响其他
				}),
			),
		);

		// 单行取消：不停止轮询，继续轮询等服务端确认取消完成
		if (fakeid) {
			toast.info('正在停止', '当前页完成后即停止');
			return;
		}

		// 全部取消：清前端状态
		stopPolling();
		activeSyncTasks.value.clear();
		taskStatusMap.value.clear();
		syncProgressMap.value.clear();
		syncingRowId.value = null;
		isSyncing.value = false;
		toast.info('已停止', '所有同步任务正在停止中');
	}

	// 同步单个公众号（增量：从最新文章开始，翻到无新文章为止）
	async function loadAccountArticle(account: Account) {
	  if (!checkLogin()) return;
	  // begin=0 从最新开始；maxPages 限制翻页数，incremental 启用"连续无新增即停"
	  await startBackgroundSync(account, { begin: 0, maxPages: 5, incremental: true });
	}

	// 同步所有选中的公众号（增量同步：从最新文章开始）
	async function loadSelectedAccountArticle() {
	  if (!checkLogin()) return;
	  isCanceled.value = false;

	  const deadline = syncToTimestamp;
	  const rows = getSelectedRows();
	  console.log(`[batch-sync] 开始批量同步 ${rows.length} 个公众号`);

	  for (let i = 0; i < rows.length; i++) {
	    const account = rows[i];
	    // 用户点了停止则不再启动后续公众号
	    if (isCanceled.value) {
	      console.log(`[batch-sync] 已取消，跳过 ${account.nickname}（第 ${i + 1}/${rows.length} 个）`);
	      break;
	    }
	    console.log(`[batch-sync] 启动第 ${i + 1}/${rows.length} 个: ${account.nickname}`);
	    // 增量：begin=0 从最新开始翻，连续两页无新增就停
	    await startBackgroundSync(account, {
	      begin: 0,
	      maxPages: 5,
	      deadline: deadline > 0 ? deadline : undefined,
	      incremental: true,
	    });
	  }
	  console.log(`[batch-sync] 批量同步循环结束，共启动 ${activeSyncTasks.value.size} 个任务`);
	}

	// 重新同步（全量：强制从头 begin=0 开始，不受时间范围限制）
	async function resyncSelectedAccounts() {
	  if (!checkLogin()) return;
	  isCanceled.value = false;

	  const rows = getSelectedRows();

	  for (const account of rows) {
	    // 用户点了停止则不再启动后续公众号
	    if (isCanceled.value) break;
	    await startBackgroundSync(account, {
	      begin: 0,
	      // 全量同步不传 deadline，翻完所有历史文章
	    });
	  }
	}

	/**
	 * 获取公众号已同步的文章数（作为增量同步的起始位置）
	 */
	async function getSyncedCount(fakeid: string): Promise<number> {
	  try {
	    const resp = await $fetch<{ data?: Account }>(`/api/web/data/v1/accounts/${fakeid}`);
	    return resp?.data?.synced_count || 0;
	  } catch {
	    return 0;
	  }
	}

	// 数据行数据
	const globalRowData = ref<Account[]>([]);

	// el-table 引用与选中行
	const tableRef = ref();
	const selectedRows = ref<Account[]>([]);

	function onSelectionChange(val: Account[]) {
	  selectedRows.value = val;
	}

	// 当前是否有选中的行
	const hasSelectedRows = computed(() => selectedRows.value.length > 0);

	function getSelectedRows(): Account[] {
	  return selectedRows.value;
	}

	/**
	 * 页面加载时检查是否有正在运行的后台同步任务，有则恢复轮询
	 * 解决"切页面后回来，同步状态丢失"的问题
	 */
	async function restoreActiveSyncTasks() {
	  try {
		const result = await accountApi.getSyncStatus();
		const tasks = result.tasks || [];
		const running = tasks.filter((t: any) => t.status === 'running' || t.status === 'pending');

		if (running.length > 0) {
		  // 恢复任务映射 + 状态映射
		  for (const t of running) {
			activeSyncTasks.value.set(t.fakeid, t.id);
			taskStatusMap.value.set(t.fakeid, t.status);
		  }
		  isSyncing.value = true;
		  syncingRowId.value = running[0].fakeid;
		  console.log(`[restore] 恢复了 ${running.length} 个正在运行的同步任务`);
		  startPolling();
		}
	  } catch (e) {
		// 静默失败
	  }
	}

	// 修改：使用新的 API 加载数据
	async function refresh() {
	  // 防止重复加载
	  if (isLoading.value) {
	    return;
	  }

	  try {
	    isLoading.value = true;
	    const result = await accountApi.fetchAccounts({ page: 1, pageSize: 1000 });
	    globalRowData.value = result.items;
	    // 标记初始化完成
	    isInitialized.value = true;
	  } catch (error: any) {
	    console.error('加载公众号列表失败:', error);
	    toast.error('加载失败', error.message);
	  } finally {
	    isLoading.value = false;
	  }
	}

	/**
	 * 单行更新：通过 fakeid 找到行，用 API 拉取最新数据后替换。
	 */
	async function updateRow(fakeid: string) {
	  try {
	    const account = await accountApi.fetchAccount(fakeid);
	    console.log(`[updateRow] fakeid: ${fakeid}, synced_count: ${account.synced_count}, total_count: ${account.total_count}`);
	    const idx = globalRowData.value.findIndex(r => r.fakeid === fakeid);
	    if (idx >= 0) {
	      globalRowData.value[idx] = account;
	    }
	  } catch (error) {
	    console.error('更新行数据失败:', fakeid, error);
	  }
	}

	/**
	 * 为 AccountActions 组件构造操作上下文。
	 * 将回调与共享状态打包，供 el-table 行内的同步/停止按钮使用。
	 */
	function buildActionContext() {
	  return {
	    isDeleting: isDeleting.value,
	    isSyncing: isSyncing.value,
	    syncingRowId: syncingRowId.value,
	    syncingFakeids: syncingFakeids.value,
	    taskStatusMap: taskStatusMap.value,
	    syncProgressMap: syncProgressMap.value,
	  };
	}

	// 挂载后：首次加载数据并恢复可能的后台同步任务
	onMounted(() => {
	  refresh();
	  restoreActiveSyncTasks();
	});

	// 删除所选的公众号数据
	function deleteSelectedAccounts() {
	  const rows = getSelectedRows();
	  const fakeids = rows.map(row => row.fakeid);
	  modal.open(ConfirmModal, {
	    title: '确定要删除所选公众号吗？',
	    description: '删除后，该公众号的所有数据(包括已下载的文章和留言等)都将被清空。',
	    async onConfirm() {
	      try {
	        isDeleting.value = true;

	        // 使用新的批量删除 API
	        await accountApi.deleteAccounts(fakeids);

	        // 通知 Credentials 面板这些公众号已被移除
	        fakeids.forEach(fakeid => accountEventBus.emit('account-removed', { fakeid }));

	        await refresh();

	        toast.success('删除成功', `已删除 ${fakeids.length} 个公众号`);
	      } catch (error: any) {
	        toast.error('删除失败', error.message);
	      } finally {
	        isDeleting.value = false;
	      }
	    },
	  });
	}

	// 导入公众号
	const fileRef = ref<HTMLInputElement | null>(null);
	const importBtnLoading = ref(false);
	function importAccount() {
	  fileRef.value!.click();
	}
	async function handleFileChange(evt: Event) {
	  const files = (evt.target as HTMLInputElement).files;
	  if (files && files.length > 0) {
	    const file = files[0];

	    try {
	      importBtnLoading.value = true;

	      // 解析 JSON
	      const jsonData = JSON.parse(await file.text());
	      if (jsonData.usefor !== 'wechat-article-exporter') {
	        // 文件格式不正确
	        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
	        return;
	      }
	      const infos = jsonData.accounts;
	      if (!infos || infos.length <= 0) {
	        // 文件格式不正确
	        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
	        return;
	      }

	      // 使用新的批量导入 API
	      const result = await accountApi.importAccounts(infos);

	      await refresh();

	      toast.success('导入完成', `成功导入 ${result.success} 个公众号${result.failed > 0 ? `，失败 ${result.failed} 个` : ''}`);
	    } catch (error: any) {
	      console.error('导入公众号时 JSON 解析失败:', error);
	      toast.error('导入失败', error.message);
	    } finally {
	      importBtnLoading.value = false;
	      // 清空文件输入，允许重复导入同一文件
	      if (fileRef.value) {
	        fileRef.value.value = '';
	      }
	    }
	  }
	}

	// 导出公众号
	const exportBtnLoading = ref(false);

	// 同步公众号信息（名称、头像、简介等）——只同步勾选的
	const syncInfoLoading = ref(false);
	async function syncAccountInfo() {
	  if (!checkLogin()) return;
	  const rows = getSelectedRows();
	  if (rows.length === 0) {
	    toast.warning('提示', '请先勾选要同步信息的公众号');
	    return;
	  }
	  syncInfoLoading.value = true;
	  try {
	    const res = await $fetch<{ success: boolean; data: { updated: number; failed: number; total: number }; message?: string }>(
	      '/api/web/data/v1/batch/sync-account-info',
	      { method: 'POST', body: { fakeids: rows.map((r: Account) => r.fakeid) }, credentials: 'include' }
	    );
	    if (res.success) {
	      toast.success('同步完成', `成功 ${res.data.updated} 个，失败 ${res.data.failed} 个`);
	      await refresh();
	    } else {
	      toast.error('同步失败', res.message || '未知错误');
	    }
	  } catch (e: any) {
	    toast.error('同步失败', e?.data?.message || e?.message);
	  } finally {
	    syncInfoLoading.value = false;
	  }
	}

	async function exportAccount() {
	  exportBtnLoading.value = true;
	  try {
	    const rows = getSelectedRows();

	    // 使用新的导出 API
	    await accountApi.exportAccounts(true); // 包含文章

	    toast.success('导出成功', `成功导出了 ${rows.length} 个公众号`);
	  } catch (error: any) {
	    toast.error('导出失败', error.message);
	  } finally {
	    exportBtnLoading.value = false;
	  }
	}

	const { getActualDateRange } = useSyncDeadline();
	</script>

	<template>
	  <div class="h-full">
	    <Teleport defer to="#title">
	      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">公众号管理</h1>
	    </Teleport>

	    <div class="flex flex-col h-full divide-y divide-gray-200">
	      <!-- 顶部操作区 -->
	      <header class="flex items-stretch gap-3 px-3 py-3">
	        <ElButton type="primary" :disabled="isDeleting || addBtnLoading" @click="addAccount">
	          <template #icon><UIcon name="i-lucide:user-plus" /></template>{{ addBtnLoading ? '添加中...' : '添加' }}
	        </ElButton>
        <ElButton type="primary" :disabled="isDeleting || urlAdding" @click="urlModalOpen = true">
	          <template #icon><UIcon name="i-lucide:link" /></template>{{ urlAdding ? '解析中...' : 'URL 添加' }}
	        </ElButton>
        <ElButton type="primary" :loading="importBtnLoading" @click="importAccount">
          <template #icon><UIcon name="i-lucide:arrow-down-to-line" /></template>批量导入
          <input ref="fileRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />
        </ElButton>
        <BatchSearchAccounts @completed="refresh" />
	        <ElButton
	          type="primary"
	          :loading="exportBtnLoading"
	          :disabled="!hasSelectedRows"
	          @click="exportAccount"
	        >
	          <template #icon><UIcon name="i-lucide:arrow-up-from-line" /></template>
		         批量导出
		        </ElButton>
		        <ElButton type="primary" plain :loading="syncInfoLoading" :disabled="!hasSelectedRows" @click="syncAccountInfo">
		          <template #icon><UIcon name="i-lucide:refresh-cw" /></template>{{ syncInfoLoading ? '同步中...' : '同步信息' }}
		        </ElButton>
	        <ElButton
	          type="danger"
	          class="disabled:opacity-35"
	          :loading="isDeleting"
	          :disabled="!hasSelectedRows"
	          @click="deleteSelectedAccounts"
	        ><template #icon><UIcon name="i-lucide:user-minus" /></template>删除</ElButton
	        >
                <ElButton
                  class="disabled:opacity-35"
                  :loading="isSyncing"
                  :disabled="isDeleting || isSyncing || !hasSelectedRows"
                  @click="loadSelectedAccountArticle"
                  ><template #icon><UIcon name="i-heroicons:arrow-path-rounded-square-20-solid" /></template>增量同步</ElButton
                >
                <ElButton
                  type="primary"
                  plain
                  class="disabled:opacity-35"
                  :loading="isSyncing"
                  :disabled="isDeleting || isSyncing || !hasSelectedRows"
                  @click="resyncSelectedAccounts"
                  ><template #icon><UIcon name="i-heroicons:arrow-path" /></template>全量同步</ElButton
                >
	        <div class="hidden xl:flex flex-1 justify-end">
	          <span class="self-end text-sm text-blue-500 font-medium">同步范围: {{ getActualDateRange() }}</span>
	        </div>
	      </header>

	      <!-- 加载状态 -->
	      <div v-show="accountApi.loading.value && !isInitialized" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
	        <div class="text-center">
	          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
	          <p class="text-gray-600">{{ accountApi.loadingText.value }}</p>
	        </div>
	      </div>

	      <!-- 错误提示 -->
	      <div v-if="accountApi.error.value" class="bg-red-50 border border-red-200 rounded-md p-4 m-4">
	        <div class="flex">
	          <div class="flex-shrink-0">
	            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
	              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 0 008 0z" clip-rule="evenodd" />
	            </svg>
	          </div>
	          <div class="ml-3">
	            <p class="text-sm font-medium text-red-800">{{ accountApi.error.value }}</p>
	            <button @click="accountApi.clearError()" class="mt-1 text-sm text-red-700 underline">关闭</button>
	          </div>
	        </div>
	      </div>

      <!-- 数据表格 -->
      <div class="flex-1 overflow-hidden p-2">
        <ElTable
          ref="tableRef"
          :data="globalRowData"
          stripe
          border
          height="100%"
          style="width: 100%"
          row-key="fakeid"
          @selection-change="onSelectionChange"
        >
          <ElTableColumn type="selection" width="55" fixed="left" reserve-selection />
          <!-- 1. fakeid -->
          <ElTableColumn prop="fakeid" label="fakeid" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="font-mono">{{ row.fakeid }}</span>
            </template>
          </ElTableColumn>
          <!-- 2. 头像 -->
          <ElTableColumn label="头像" width="80">
            <template #default="{ row }">
              <img :src="IMAGE_PROXY + row.round_head_img" class="size-8 rounded-full object-cover border border-gray-200" alt="" />
            </template>
          </ElTableColumn>
          <!-- 3. 名称 -->
          <ElTableColumn prop="nickname" label="名称" min-width="200" sortable show-overflow-tooltip />
          <!-- 4. 添加时间 -->
          <ElTableColumn prop="create_time" label="添加时间" min-width="180" sortable>
            <template #default="{ row }">
              {{ row.create_time ? formatTimeStamp(row.create_time) : '' }}
            </template>
          </ElTableColumn>
          <!-- 5. 最后更新时间 -->
          <ElTableColumn prop="update_time" label="最后更新时间" min-width="180" sortable>
            <template #default="{ row }">
              {{ row.update_time ? formatTimeStamp(row.update_time) : '' }}
            </template>
          </ElTableColumn>
          <!-- 6. 消息总数 -->
          <ElTableColumn prop="total_count" label="消息总数" min-width="150" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.total_count }}</span>
            </template>
          </ElTableColumn>
          <!-- 7. 已同步文章数 -->
          <ElTableColumn prop="synced_count" label="已同步文章数" min-width="150" sortable>
            <template #default="{ row }">
              <span class="font-mono">{{ row.synced_count }}</span>
            </template>
          </ElTableColumn>
          <!-- 8. 同步进度 -->
          <ElTableColumn label="同步进度" min-width="200">
            <template #default="{ row }">
              <GridLoadProgress :value="{ count: row.synced_count || 0, total: row.total_count || 0 }" />
            </template>
          </ElTableColumn>
          <!-- 9. 同步完成 -->
          <ElTableColumn label="同步完成" min-width="150" sortable
            :filters="[{ text: '已完成', value: 'true' }, { text: '进行中', value: 'false' }]"
            :filter-method="(val: string, row: Account) => String(row.total_count > 0 && row.synced_count >= row.total_count) === val"
          >
            <template #default="{ row }">
              <ElTag :type="row.total_count > 0 && row.synced_count >= row.total_count ? 'success' : 'info'" size="small">
                {{ row.total_count > 0 && row.synced_count >= row.total_count ? '已完成' : '进行中' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <!-- 10. 操作 -->
          <ElTableColumn label="操作" min-width="160" fixed="right">
            <template #default="{ row }">
              <GridAccountActions
                :data="row"
                :on-sync="loadAccountArticle"
                :on-stop="(data: any) => cancelSync(data.fakeid)"
                :context="buildActionContext()"
              />
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>

	    <!-- 添加公众号弹框 -->
	    <GlobalSearchAccountDialog ref="searchAccountDialogRef" @select:account="onSelectAccount" />

    <!-- URL 添加弹框 -->
    <ElDialog v-model="urlModalOpen" width="520px">
      <template #header>
        <h3 class="text-lg font-semibold">通过 URL 添加公众号</h3>
      </template>
      <ElInput
        v-model="urlInput"
        placeholder="粘贴公众号主页链接或文章链接"
        class="w-full font-mono"
        autofocus
        @keyup.enter="addAccountByUrl"
      />
      <p class="mt-2 text-xs text-gray-400">
        支持公众号主页链接（profile_ext）和文章链接（mp.weixin.qq.com/s/xxx）
      </p>
      <template #footer>
        <ElButton @click="urlModalOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="urlAdding" :disabled="!urlInput.trim()" @click="addAccountByUrl">
          解析并添加
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>
