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
	import { getArticleList } from '~/apis'; // 保留：调用微信 API
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

	interface PromiseInstance {
	  resolve: (value: unknown) => void;
	  reject: (reason?: any) => void;
	}

	const toast = toastFactory();
	const modal = useModal();
	const { checkLogin } = useLoginCheck();

	// 新增：使用公众号 API
	const accountApi = useAccountApiWithState();

	const { getSyncTimestamp, getSyncRangeLabel, isSyncAll } = useSyncDeadline();
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

	  searchAccountDialogRef.value!.open();
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

	    // 不再自动同步文章
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

	const syncTimer = ref<number | null>(null);

	// 防止重复加载的标志
	const isLoading = ref(false);

	// 标记是否已经初始化完成（用于首次加载时显示加载状态）
	const isInitialized = ref(false);

	async function _load(account: Account, begin: number, loadMore: boolean, promise: PromiseInstance) {
	  if (isCanceled.value) {
	    isCanceled.value = false; // 这里需要将状态复位
	    promise.reject(new Error('已取消同步'));
	    return;
	  }

	  syncingRowId.value = account.fakeid;
	  isSyncing.value = true;

	  // 保留：调用微信 API 获取文章列表
	  const [articles, completed, totalCount] = await getArticleList(account, begin);

	  // 如果是第一批（begin=0）且有总数，更新公众号的 total_count
	  if (begin === 0 && totalCount > 0) {
	    try {
	      await $fetch('/api/web/data/v1/accounts/' + account.fakeid, {
	        method: 'PATCH',
	        body: { total_count: totalCount }
	      });
	    } catch (error) {
	      console.error('更新公众号总数失败:', error);
	    }
	  }
	  if (isCanceled.value) {
	    isCanceled.value = false;
	    promise.reject(new Error('已取消同步'));
	    return;
	  }
	  if (completed) {
	    // 同步完成时，更新 total_count 为实际同步的数量
	    try {
	      const response = await $fetch<Account>(`/api/web/data/v1/accounts/${account.fakeid}`);
	      if (response && response.data && response.data.synced_count > 0) {
	        await $fetch('/api/web/data/v1/accounts/' + account.fakeid, {
	          method: 'PATCH',
	          body: { total_count: response.data.synced_count }
	        });
	        console.log(`[sync completed] 更新 total_count: ${response.data.synced_count}`);
	      }
	    } catch (error) {
	      console.error('更新 total_count 失败:', error);
	    }

	    await updateRow(account.fakeid);
	    syncingRowId.value = null;
	    isSyncing.value = false;
	    promise.resolve(account);
	    return;
	  }

	  const count = articles.filter(article => article.itemidx === 1).length; // 消息数
	  begin += count;

	  // 使用 API 批量保存文章到 SQLite
	  try {
	    // 转换文章格式
	    const articlesData = articles
	      .filter(article => article.itemidx === 1)
	      .map(article => ({
	        key: `${account.fakeid}:${article.aid}`,
	        fakeid: account.fakeid,
	        aid: article.aid,
	        title: article.title,
	        link: article.link,
	        cover: article.cover,
	        author: article.author,
	        create_time: article.create_time,
	        update_time: article.update_time,
	        datetime: article.datetime,
	        digest: article.digest,
	        downloaded: 0,
	        is_deleted: 0
	      }));

	    // 通过 API 保存文章
	    await $fetch('/api/web/data/v1/batch/save-articles', {
	      method: 'POST',
	      body: {
	        articles: articlesData
	      }
	    });
	  } catch (error) {
	    console.error('保存文章失败:', error);
	  }

	  // 更新行数据
	  await updateRow(account.fakeid);

	  if (articles.at(-1)!.create_time < syncToTimestamp) {
	    // 已同步到配置的时间范围
	    loadMore = false;
	  }

	  if (loadMore) {
	    syncTimer.value = window.setTimeout(
	      () => {
	        if (isCanceled.value) {
	          console.warn('已取消同步');
	          isCanceled.value = false;
	          promise.reject(new Error('已取消同步'));
	          return;
	        }
	        _load(account, begin, true, promise);
	      },
	      ((preferences.value as unknown as Preferences).accountSyncSeconds || 5) * 1000
	    );
	  } else {
	    syncingRowId.value = null;
	    isSyncing.value = false;
	    promise.resolve(account);
	  }
	}

	// 同步指定公众号
	async function loadAccountArticle(account: Account, loadMore = true) {
	  return new Promise(async (resolve, reject) => {
	    const promise: PromiseInstance = { resolve, reject };

	    // 获取当前已同步的文章数，从该位置继续同步
	    let begin = 0;
	    try {
	      const response = await $fetch<Account>(`/api/web/data/v1/accounts/${account.fakeid}`);
	      if (response && response.data) {
	        begin = response.data.synced_count || 0;
	        console.log(`[loadAccountArticle] 从已同步位置继续: ${begin}`);
	      }
	    } catch (error) {
	      console.warn('获取已同步文章数失败，从头开始同步:', error);
	    }

	    _load(account, begin, loadMore, promise).catch(e => {
	      syncingRowId.value = null;
	      isSyncing.value = false;

	      if (e.message === 'session expired') {
	        modal.open(LoginModal);
	      }
	      reject(e);
	    });
	  });
	}

	// 同步所有公众号
	async function loadSelectedAccountArticle() {
	  if (!checkLogin()) return;

	  isCanceled.value = false;

	  try {
	    const rows = getSelectedRows();
	    for (const account of rows) {
	      await loadAccountArticle(account);
	    }
	    const rangeHint = isSyncAll() ? '' : `（同步范围：${getSyncRangeLabel()}）`;
	    toast.success('同步完成', `已成功同步 ${rows.length} 个公众号${rangeHint}`);
	  } catch (e: any) {
	    toast.error('同步失败', e.message);
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
	        if (!checkLogin()) return;

	        isCanceled.value = false;
	        loadAccountArticle(params.data)
	          .then(() => {
	            const rangeHint = isSyncAll() ? '' : `（同步范围：${getSyncRangeLabel()}）`;
	            toast.success('同步完成', `公众号【${params.data.nickname}】的文章已同步完毕${rangeHint}`);
	          })
	          .catch(e => {
	            toast.error('同步失败', e.message);
	          });
	      },
	      onStop: (params: ICellRendererParams) => {
	        isCanceled.value = true;
	        if (syncTimer.value) {
	          window.clearTimeout(syncTimer.value);
	          syncTimer.value = null;
	        }

	        syncingRowId.value = null;
	        isSyncing.value = false;
	      },
	      isDeleting: isDeleting,
	      isSyncing: isSyncing,
	      syncingRowId: syncingRowId,
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
	          >同步</UButton
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
