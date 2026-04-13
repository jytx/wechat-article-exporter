<script setup lang="ts">
	import { websiteName } from '~/config';
	import { useMigrationApiWithState, useMigrationPolling } from '~/composables/useMigrationApi';
	import type { MigrationStatus } from '~/composables/useMigrationApi';
	import {
	  exportFromIndexedDB,
	  getIndexedDBStats,
	  downloadExportedData
	} from '~/utils/indexeddb-export';

	useHead({
	  title: `数据迁移 | ${websiteName}`,
	});

	const migrationApi = useMigrationApiWithState();
	const { currentStatus, polling, startPolling, stopPolling, clearStatus } = useMigrationPolling(2000);

	// IndexedDB 数据统计
	const indexedDBStats = ref({
	  accounts: 0,
	  articles: 0,
	  estimatedSize: '0 B'
	});

	// 后端数据统计
	const backendStats = ref({
	  accounts: 0,
	  articles: 0
	});

	// 数据验证结果
	const verificationResult = ref<{
	  accounts_match: boolean;
	  articles_match: boolean;
	  diff: {
	    accounts: number;
	    articles: number;
	  };
	} | null>(null);

	// 迁移步骤
	const currentStep = ref<'check' | 'export' | 'import' | 'verify' | 'complete'>('check');

	// 是否显示导出确认
	const showExportConfirm = ref(false);

	// 加载 IndexedDB 统计
	async function loadIndexedDBStats() {
	  try {
	    const stats = await getIndexedDBStats();
	    indexedDBStats.value = stats;
	  } catch (error: any) {
	    console.error('加载 IndexedDB 统计失败:', error);
	    alert('加载 IndexedDB 统计失败: ' + error.message);
	  }
	}

	// 加载后端统计
	async function loadBackendStats() {
	  try {
	    const response = await fetch('/api/web/data/v1/system/status');
	    const result = await response.json();
	    if (result && result.data) {
	      backendStats.value.accounts = result.data.storage.accounts_count;
	      backendStats.value.articles = result.data.storage.articles_count;
	    }
	  } catch (error: any) {
	    console.error('加载后端统计失败:', error);
	    // 静默失败，不显示错误
	  }
	}

	// 验证数据一致性
	async function handleVerify() {
	  try {
	    const result = await migrationApi.verifyData(
	      indexedDBStats.value.accounts,
	      indexedDBStats.value.articles
	    );
	    verificationResult.value = result;
	  } catch (error: any) {
	    console.error('验证数据失败:', error);
	    alert('验证数据失败: ' + error.message);
	  }
	}

	// 开始迁移流程
	async function handleStartMigration() {
	  showExportConfirm.value = true;
	}

	// 确认导出并开始迁移
	async function confirmAndMigrate() {
	  showExportConfirm.value = false;
	  currentStep.value = 'export';

	  try {
	    // 1. 导出 IndexedDB 数据
	    const data = await exportFromIndexedDB();

	    // 2. 开始迁移
	    currentStep.value = 'import';
	    const response = await migrationApi.startMigration({
	      indexeddb_accounts: data.accounts.length,
	      indexeddb_articles: data.articles.length
	    });

	    // 3. 开始轮询迁移状态
	    startPolling(response.migration_id);

	    // 4. 导入数据
	    await migrationApi.importData({
	      accounts: data.accounts,
	      articles: data.articles
	    });

	    // 5. 验证数据
	    currentStep.value = 'verify';
	    await handleVerify();

	    currentStep.value = 'complete';
	    stopPolling();

	    alert('数据迁移完成！');

	    // 刷新统计
	    await loadIndexedDBStats();
	    await loadBackendStats();

	  } catch (error: any) {
	    console.error('迁移失败:', error);
	    stopPolling();
	    alert('迁移失败: ' + error.message);
	    currentStep.value = 'check';
	  }
	}

	// 取消迁移
	async function handleCancelMigration() {
	  if (!currentStatus.value) return;

	  if (!confirm('确定要取消当前迁移吗？')) {
	    return;
	  }

	  try {
	    await migrationApi.cancelMigration(currentStatus.value.id);
	    stopPolling();
	    clearStatus();
	    currentStep.value = 'check';
	    alert('迁移已取消');
	  } catch (error: any) {
	    console.error('取消迁移失败:', error);
	    alert('取消迁移失败: ' + error.message);
	  }
	}

	// 下载导出数据
	async function handleDownloadExport() {
	  try {
	    await downloadExportedData();
	  } catch (error: any) {
	    console.error('下载数据失败:', error);
	    alert('下载数据失败: ' + error.message);
	  }
	}

	// 计算迁移进度
	const migrationProgress = computed(() => {
	  if (!currentStatus.value) return 0;

	  const { progress } = currentStatus.value;
	  const total = progress.accounts.total + progress.articles.total;
	  const migrated = progress.accounts.migrated + progress.articles.migrated;

	  return total > 0 ? Math.round((migrated / total) * 100) : 0;
	});

	// 页面加载时获取统计
	onMounted(async () => {
	  await loadIndexedDBStats();
	  await loadBackendStats();
	});
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">数据迁移</h1>
    </Teleport>

    <div class="max-w-6xl mx-auto p-6">
      <!-- 说明区域 -->
      <div class="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
        <h3 class="text-lg font-semibold text-blue-800 mb-2">数据迁移说明</h3>
        <p class="text-sm text-blue-700 mb-2">
          此工具将帮助您将数据从 IndexedDB 迁移到后端存储。迁移过程包括：
        </p>
        <ol class="text-sm text-blue-700 list-decimal list-inside space-y-1">
          <li>从 IndexedDB 导出公众号和文章数据</li>
          <li>将数据导入到后端存储</li>
          <li>验证数据一致性</li>
        </ol>
        <p class="text-sm text-blue-700 mt-2">
          ⚠️ 注意：迁移过程中请勿关闭页面。建议在迁移前先下载数据备份。
        </p>
      </div>

      <!-- 加载状态 -->
      <div v-if="migrationApi.loading.value" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-600">{{ migrationApi.loadingText.value }}</p>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="migrationApi.error.value" class="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 0 008 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium text-red-800">{{ migrationApi.error.value }}</p>
            <button @click="migrationApi.clearError()" class="mt-1 text-sm text-red-700 underline">关闭</button>
          </div>
        </div>
      </div>

      <!-- 数据统计 -->
      <div v-else class="space-y-6">
        <!-- IndexedDB 和后端数据对比 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- IndexedDB 数据 -->
          <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">IndexedDB 数据</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-gray-600">公众号数量：</span>
                <span class="font-mono text-lg font-semibold">{{ indexedDBStats.accounts }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-600">文章数量：</span>
                <span class="font-mono text-lg font-semibold">{{ indexedDBStats.articles }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-600">估算大小：</span>
                <span class="font-mono">{{ indexedDBStats.estimatedSize }}</span>
              </div>
            </div>
          </div>

          <!-- 后端数据 -->
          <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">后端存储数据</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-gray-600">公众号数量：</span>
                <span class="font-mono text-lg font-semibold">{{ backendStats.accounts }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-600">文章数量：</span>
                <span class="font-mono text-lg font-semibold">{{ backendStats.articles }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 数据验证结果 -->
        <div v-if="verificationResult" class="bg-white border border-gray-200 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">数据验证结果</h3>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-600">公众号一致性：</span>
              <span
                :class="verificationResult.accounts_match ? 'text-green-600' : 'text-red-600'"
                class="font-semibold"
              >
                {{ verificationResult.accounts_match ? '✓ 一致' : '✗ 不一致' }}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">文章一致性：</span>
              <span
                :class="verificationResult.articles_match ? 'text-green-600' : 'text-red-600'"
                class="font-semibold"
              >
                {{ verificationResult.articles_match ? '✓ 一致' : '✗ 不一致' }}
              </span>
            </div>
            <div v-if="!verificationResult.accounts_match || !verificationResult.articles_match" class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p class="text-sm text-yellow-800">
                差异：公众号 {{ verificationResult.diff.accounts > 0 ? '+' : '' }}{{ verificationResult.diff.accounts }}，
                文章 {{ verificationResult.diff.articles > 0 ? '+' : '' }}{{ verificationResult.diff.articles }}
              </p>
            </div>
          </div>
        </div>

        <!-- 迁移进度 -->
        <div v-if="currentStatus" class="bg-white border border-gray-200 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">迁移进度</h3>
          <div class="space-y-4">
            <!-- 进度条 -->
            <div>
              <div class="flex justify-between mb-2">
                <span class="text-sm text-gray-600">总体进度</span>
                <span class="text-sm font-semibold">{{ migrationProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-4">
                <div
                  class="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  :style="{ width: `${migrationProgress}%` }"
                ></div>
              </div>
            </div>

            <!-- 详细进度 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-gray-600 mb-1">公众号迁移</p>
                <p class="font-mono text-sm">
                  {{ currentStatus.progress.accounts.migrated }} / {{ currentStatus.progress.accounts.total }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-600 mb-1">文章迁移</p>
                <p class="font-mono text-sm">
                  {{ currentStatus.progress.articles.migrated }} / {{ currentStatus.progress.articles.total }}
                </p>
              </div>
            </div>

            <!-- 状态 -->
            <div class="flex items-center space-x-2">
              <span class="text-sm text-gray-600">状态：</span>
              <span
                :class="{
                  'text-yellow-600': currentStatus.status === 'in_progress',
                  'text-green-600': currentStatus.status === 'completed',
                  'text-red-600': currentStatus.status === 'failed',
                  'text-gray-600': currentStatus.status === 'cancelled'
                }"
                class="font-semibold"
              >
                {{
                  currentStatus.status === 'in_progress' ? '进行中' :
                  currentStatus.status === 'completed' ? '已完成' :
                  currentStatus.status === 'failed' ? '失败' : '已取消'
                }}
              </span>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-4">
          <!-- 验证数据按钮 -->
          <button
            @click="handleVerify"
            :disabled="migrationApi.loading.value"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            验证数据一致性
          </button>

          <!-- 下载数据备份按钮 -->
          <button
            @click="handleDownloadExport"
            :disabled="migrationApi.loading.value"
            class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下载数据备份
          </button>

          <!-- 开始迁移按钮 -->
          <button
            v-if="!currentStatus && currentStep === 'check'"
            @click="handleStartMigration"
            :disabled="indexedDBStats.accounts === 0 || migrationApi.loading.value"
            class="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            开始数据迁移
          </button>

          <!-- 取消迁移按钮 -->
          <button
            v-if="currentStatus && currentStatus.status === 'in_progress'"
            @click="handleCancelMigration"
            :disabled="migrationApi.loading.value"
            class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消迁移
          </button>
        </div>

        <!-- 当前步骤提示 -->
        <div v-if="currentStep !== 'check'" class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-yellow-800">
                {{
                  currentStep === 'export' ? '正在导出 IndexedDB 数据...' :
                  currentStep === 'import' ? '正在导入数据到后端...' :
                  currentStep === 'verify' ? '正在验证数据一致性...' :
                  '迁移完成！'
                }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 导出确认对话框 -->
    <div v-if="showExportConfirm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">确认开始迁移</h3>
        <p class="text-sm text-gray-600 mb-4">
          即将开始数据迁移。系统将：
        </p>
        <ol class="text-sm text-gray-600 list-decimal list-inside space-y-1 mb-4">
          <li>从 IndexedDB 导出 {{ indexedDBStats.accounts }} 个公众号和 {{ indexedDBStats.articles }} 篇文章</li>
          <li>将数据导入到后端存储</li>
          <li>验证数据一致性</li>
        </ol>
        <p class="text-sm text-red-600 font-semibold mb-4">
          ⚠️ 迁移过程中请勿关闭页面！
        </p>
        <div class="flex justify-end space-x-3">
          <button
            @click="showExportConfirm = false"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            @click="confirmAndMigrate"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            确认开始
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
