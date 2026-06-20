<script setup lang="ts">
	import type {
	  ColDef,
	  GetRowIdParams,
	  GridApi,
	  GridOptions,
	  GridReadyEvent,
	  ICellRendererParams,
	  SelectionChangedEvent,
	  ValueGetterParams,
	} from 'ag-grid-community';
	import { AgGridVue } from 'ag-grid-vue3';
	import { defu } from 'defu';
	import { formatTimeStamp } from '#shared/utils/helpers';
	import GlobalSearchAccountDialog from '~/components/global/SearchAccountDialog.vue';
	import GridAccountActions from '~/components/grid/AccountActions.vue';
	import GridLoadProgress from '~/components/grid/LoadProgress.vue';
	import ConfirmModal from '~/components/modal/Confirm.vue';
	import LoginModal from '~/components/modal/Login.vue';
	import toastFactory from '~/composables/toast';
	import useLoginCheck from '~/composables/useLoginCheck';
	import { IMAGE_PROXY, websiteName } from '~/config';
	import { sharedGridOptions } from '~/config/shared-grid-options';
	import type { AccountManifest } from '~/types/account';
	import type { Preferences } from '~/types/preferences';
	import { exportAccountJsonFile } from '~/utils/exporter';
	import { createBooleanColumnFilterParams, createDateColumnFilterParams } from '~/utils/grid';
	// 新增：使用新的 API
	import { useAccountApiWithState } from '~/composables/useAccountApi';
	import type { Account } from '~/types/api';

	useHead({
	  title: `公众号管理 | ${websiteName}`,
	});

	const toast = toastFactory();
	const modal = useModal();
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

	// 表示同步过程中是否执行了取消操作
	const isCanceled = ref(false);
	const isDeleting = ref(false);
	const isSyncing = ref(false);

	// 当前正在同步的公众号id
	const syncingRowId = ref<string | null>(null);

	// 正在运行的后台任务（fakeid -> taskId）
	const activeSyncTasks = ref<Map<string, string>>(new Map());

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
	  options: { begin?: number; deadline?: number } = {},
	): Promise<void> {
	  if (activeSyncTasks.value.has(account.fakeid)) {
	    toast.info('提示', `${account.nickname} 正在同步中`);
	    return;
	  }

	  const intervalSeconds = (preferences.value as unknown as Preferences).accountSyncSeconds || 5;

	  try {
	    const result = await accountApi.syncAccount(account.fakeid, {
	      ...options,
	      intervalSeconds,
	    });

	    if (result.error) {
	      if (result.error === 'session expired' || result.error === '未登录或登录已过期') {
	        modal.open(LoginModal);
	      }
	      toast.error('同步失败', result.error);
	      return;
	    }

	    if (result.alreadyRunning) {
	      toast.info('提示', `${account.nickname} 正在同步中`);
	      return;
	    }

	    // 记录任务，开始轮询
	    activeSyncTasks.value.set(account.fakeid, result.taskId);
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

	        if (task.status === 'completed' || task.status === 'failed') {
	          activeSyncTasks.value.delete(fakeid);
	          await updateRow(fakeid);

	          if (task.status === 'failed') {
	            if (task.error === 'session expired') {
	              modal.open(LoginModal);
	            }
	            toast.error('同步失败', `${task.nickname}: ${task.message}`);
	          } else {
	            toast.success('同步完成', task.message);
	          }
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
	 * 取消同步（前端停止轮询，服务端任务继续跑完当前页后自然结束）
	 */
	function cancelSync() {
	  stopPolling();
	  activeSyncTasks.value.clear();
	  syncingRowId.value = null;
	  isSyncing.value = false;
	  isCanceled.value = false;
	}

	// 同步单个公众号（增量：从已同步位置继续）
	async function loadAccountArticle(account: Account) {
	  if (!checkLogin()) return;
	  // 查询已同步数量作为起始位置
	  const begin = await getSyncedCount(account.fakeid);
	  await startBackgroundSync(account, { begin });
	}

	// 同步所有选中的公众号（增量同步：从各自已同步位置继续）
	async function loadSelectedAccountArticle() {
	  if (!checkLogin()) return;
	  isCanceled.value = false;

	  const deadline = syncToTimestamp;
	  const rows = getSelectedRows();

	  for (const account of rows) {
	    // 增量：从已同步位置继续，只拉新文章
	    const begin = await getSyncedCount(account.fakeid);
	    await startBackgroundSync(account, {
	      begin,
	      deadline: deadline > 0 ? deadline : undefined,
	    });
	  }
	}

	// 重新同步（全量：强制从头 begin=0 开始）
	async function resyncSelectedAccounts() {
	  if (!checkLogin()) return;
	  isCanceled.value = false;

	  const deadline = syncToTimestamp;
	  const rows = getSelectedRows();

	  for (const account of rows) {
	    await startBackgroundSync(account, {
	      begin: 0,
	      deadline: deadline > 0 ? deadline : undefined,
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

	const columnDefs = ref<ColDef[]>([
	  {
	    colId: 'fakeid',
	    headerName: 'fakeid',
	    field: 'fakeid',
	    cellDataType: 'text',
	    filter: 'agTextColumnFilter',
	    minWidth: 200,
	    cellClass: 'font-mono',
	    initialHide: true,
	  },
	  {
	    colId: 'round_head_img',
	    headerName: '头像',
	    field: 'round_head_img',
	    sortable: false,
	    filter: false,
	    cellRenderer: (params: ICellRendererParams) => {
	      return `<img alt="" src="${IMAGE_PROXY + params.value}" style="height: 30px; width: 30px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 100%;" />`;
	    },
	    cellClass: 'flex justify-center items-center',
	    minWidth: 80,
	  },
	  {
	    colId: 'nickname',
	    headerName: '名称',
	    field: 'nickname',
	    cellDataType: 'text',
	    filter: 'agTextColumnFilter',
	    tooltipField: 'nickname',
	    minWidth: 200,
	  },
	  {
	    colId: 'create_time',
	    headerName: '添加时间',
	    field: 'create_time',
	    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
	    filter: 'agDateColumnFilter',
	    filterParams: createDateColumnFilterParams(),
	    filterValueGetter: (params: ValueGetterParams) => {
	      const value = params.getValue('create_time');
	      if (value && typeof value === 'number' && value > 0) {
	        // 判断是秒级还是毫秒级时间戳（10位是秒，13位是毫秒）
	        const timestamp = value < 10000000000 ? value * 1000 : value;
	        return new Date(timestamp);
	      }
	      return null;
	    },
	    sort: 'desc',
	    minWidth: 180,
	    initialHide: true,
	    cellClass: 'flex justify-center items-center font-mono',
	  },
	  {
	    colId: 'update_time',
	    headerName: '最后更新时间',
	    field: 'update_time',
	    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
	    filter: 'agDateColumnFilter',
	    filterParams: createDateColumnFilterParams(),
	    filterValueGetter: (params: ValueGetterParams) => {
	      const value = params.getValue('update_time');
	      if (value && typeof value === 'number' && value > 0) {
	        // 判断是秒级还是毫秒级时间戳（10位是秒，13位是毫秒）
	        const timestamp = value < 10000000000 ? value * 1000 : value;
	        return new Date(timestamp);
	      }
	      return null;
	    },
	    minWidth: 180,
	    cellClass: 'flex justify-center items-center font-mono',
	  },
	  {
	    colId: 'total_count',
	    headerName: '消息总数*',
	    field: 'total_count',
	    cellDataType: 'number',
	    cellRenderer: 'agAnimateShowChangeCellRenderer',
	    filter: 'agNumberColumnFilter',
	    cellClass: 'flex justify-center items-center font-mono',
	    minWidth: 150,
	    headerTooltip: '消息总数（同步前为微信API预估，同步完成后更新为实际可获取数量）',
	  },
	  {
	    colId: 'synced_count',
	    headerName: '已同步文章数',
	    field: 'synced_count',
	    cellDataType: 'number',
	    cellRenderer: 'agAnimateShowChangeCellRenderer',
	    filter: 'agNumberColumnFilter',
	    cellClass: 'flex justify-center items-center font-mono',
	    minWidth: 150,
	  },
	  {
	    colId: 'load_percent',
	    headerName: '同步进度',
	    valueGetter: params => {
      const total = params.data.total_count || 0;
      const synced = params.data.synced_count || 0;
      return {
        count: synced,
        total: total
      };
    },
	    cellDataType: 'object',
	    cellRenderer: GridLoadProgress,
	    filter: 'agNumberColumnFilter',
	    cellClass: 'flex items-center',
	    minWidth: 200,
	  },
	  {
	    colId: 'completed',
	    headerName: '同步完成',
	    valueGetter: params => {
      const total = params.data.total_count || 0;
      const synced = params.data.synced_count || 0;
      return total > 0 && synced >= total;
    },
	    cellDataType: 'boolean',
	    filter: 'agSetColumnFilter',
	    filterParams: createBooleanColumnFilterParams('已完成', '进行中'),
	    cellClass: 'flex justify-center items-center',
	    headerClass: 'justify-center',
	    minWidth: 150,
	  },
	  {
	    colId: 'action',
	    headerName: '操作',
	    field: 'fakeid',
	    sortable: false,
	    filter: false,
	    cellRenderer: GridAccountActions,
	    cellRendererParams: {
	      onSync: (params: ICellRendererParams) => {
	        // 后台任务模式：触发后立即返回，进度通过轮询获取，切页面不中断
	        loadAccountArticle(params.data);
	      },
	      onStop: (params: ICellRendererParams) => {
	        // 前端停止轮询（服务端任务跑完当前页后自然结束）
	        cancelSync();
	      },
	      isDeleting: isDeleting,
	      isSyncing: isSyncing,
	      syncingRowId: syncingRowId,
	      syncingFakeids: syncingFakeids,
	    },
	    cellClass: 'flex justify-center items-center',
	    maxWidth: 100,
	    pinned: 'right',
	  },
	]);

	// 注意，`defu`函数最左边的参数优先级最高
	const gridOptions: GridOptions = defu(
	  {
	    getRowId: (params: GetRowIdParams) => String(params.data.fakeid),
	  },
	  sharedGridOptions
	);

	const gridApi = shallowRef<GridApi | null>(null);
	function onGridReady(params: GridReadyEvent) {
	  gridApi.value = params.api;

	  restoreColumnState();
	  refresh();
	  // 恢复可能有正在运行的后台同步任务（切页面后回来）
	  restoreActiveSyncTasks();
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
	      // 恢复任务映射
	      for (const t of running) {
	        activeSyncTasks.value.set(t.fakeid, t.id);
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

	function onColumnStateChange() {
	  if (gridApi.value) {
	    saveColumnState();
	  }
	}
	function saveColumnState() {
	  const state = gridApi.value?.getColumnState();
	  localStorage.setItem('agGridColumnState-account', JSON.stringify(state));
	}

	function restoreColumnState() {
	  const stateStr = localStorage.getItem('agGridColumnState-account');
	  if (stateStr) {
	    const state = JSON.parse(stateStr);
	    gridApi.value?.applyColumnState({
	      state,
	      applyOrder: true,
	    });
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
	    // 不要同时调用 setGridOption，让 AG Grid 自动响应 ref 的变化
	    // gridApi.value?.setGridOption('rowData', globalRowData.value);
	  } catch (error: any) {
	    console.error('加载公众号列表失败:', error);
	    toast.error('加载失败', error.message);
	  } finally {
	    isLoading.value = false;
	  }
	}

	async function updateRow(fakeid: string) {
	  const rowNode = gridApi.value?.getRowNode(fakeid);
	  if (rowNode) {
	    // 使用 API 获取最新数据
	    try {
	      const account = await accountApi.fetchAccount(fakeid);
	      console.log(`[updateRow] fakeid: ${fakeid}, synced_count: ${account.synced_count}, total_count: ${account.total_count}`);

	      // 使用 setData 更新数据（AG Grid 推荐的单行更新方法）
	      rowNode.setData(account);
	    } catch (error) {
	      console.error('更新行数据失败:', fakeid, error);
	    }
	  }
	}

	// 当前是否有选中的行
	const hasSelectedRows = ref(false);
	function onSelectionChanged(evt: SelectionChangedEvent) {
	  hasSelectedRows.value = (evt.selectedNodes?.map(node => node.data) || []).length > 0;
	}
	function getSelectedRows() {
	  const rows: Account[] = [];
	  gridApi.value?.forEachNodeAfterFilterAndSort(node => {
	    if (node.isSelected()) {
	      rows.push(node.data);
	    }
	  });
	  return rows;
	}

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
	        <UButton icon="i-lucide:user-plus" color="blue" :disabled="isDeleting || addBtnLoading" @click="addAccount">
	          {{ addBtnLoading ? '添加中...' : '添加' }}
	        </UButton>
	        <UButton icon="i-lucide:arrow-down-to-line" color="blue" :loading="importBtnLoading" @click="importAccount">
	          批量导入
	          <input ref="fileRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />
	        </UButton>
	        <UButton
	          icon="i-lucide:arrow-up-from-line"
	          color="blue"
	          :loading="exportBtnLoading"
	          :disabled="!hasSelectedRows"
	          @click="exportAccount"
	        >
	          批量导出
	        </UButton>
	        <UButton
	          color="rose"
	          icon="i-lucide:user-minus"
	          class="disabled:opacity-35"
	          :loading="isDeleting"
	          :disabled="!hasSelectedRows"
	          @click="deleteSelectedAccounts"
	        >删除</UButton
	        >
                <UButton
                  color="black"
                  icon="i-heroicons:arrow-path-rounded-square-20-solid"
                  class="disabled:opacity-35"
                  :loading="isSyncing"
                  :disabled="isDeleting || !hasSelectedRows"
                  @click="loadSelectedAccountArticle"
                  >增量同步</UButton
                >
                <UButton
                  color="primary"
                  variant="outline"
                  icon="i-heroicons:arrow-path"
                  class="disabled:opacity-35"
                  :loading="isSyncing"
                  :disabled="isDeleting || !hasSelectedRows"
                  @click="resyncSelectedAccounts"
                  >全量同步</UButton
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
	      <ag-grid-vue
	        style="width: 100%; height: 100%"
	        :rowData="globalRowData"
	        :columnDefs="columnDefs"
	        :gridOptions="gridOptions"
	        @grid-ready="onGridReady"
	        @selection-changed="onSelectionChanged"
	        @column-moved="onColumnStateChange"
	        @column-visible="onColumnStateChange"
	        @column-pinned="onColumnStateChange"
	        @column-resized="onColumnStateChange"
	      ></ag-grid-vue>
	    </div>

	    <!-- 添加公众号弹框 -->
	    <GlobalSearchAccountDialog ref="searchAccountDialogRef" @select:account="onSelectAccount" />
	  </div>
	</template>
