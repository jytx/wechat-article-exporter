<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">操作日志</h1>
    </Teleport>

    <div class="flex flex-col h-full">
      <!-- 顶部操作区：类型筛选 + 刷新 -->
      <header class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <ElButton
            v-for="tab in TABS"
            :key="tab.value"
            size="small"
            type="primary"
            text
            @click="switchType(tab.value)"
          >
            {{ tab.label }}
          </ElButton>
          <span v-if="!loading" class="text-xs text-gray-400 ml-2">
            共 {{ logLines.length }} 条
          </span>
        </div>
        <ElButton
          size="small"
          :loading="loading"
          @click="loadLogs"
        >
          <template #icon><UIcon name="i-lucide:refresh-cw" /></template>
          刷新
        </ElButton>
      </header>

      <!-- 日志主体 -->
      <div ref="logContainer" class="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <div v-if="error" class="p-4 text-center text-gray-400">{{ error }}</div>
        <div v-else-if="logLines.length === 0 && !loading" class="p-4 text-center text-gray-400">暂无日志</div>
        <pre v-else class="p-3 text-xs font-mono leading-relaxed"><div
          v-for="(line, i) in logLines"
          :key="i"
          :class="lineClass(line)"
          class="px-2 py-0.5 rounded"
        >{{ line.raw }}</div></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';

/** 日志类型筛选选项 */
const TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'sync', label: '同步' },
  { value: 'schedule', label: '定时同步' },
  { value: 'subscription', label: '订阅推送' },
  { value: 'other', label: '其他' },
];

/** 单条日志的结构 */
interface LogLine {
  raw: string;
  type: 'sync' | 'schedule' | 'subscription' | 'other';
  level: 'info' | 'warn' | 'error';
}

const activeType = ref('all');
const logLines = ref<LogLine[]>([]);
const loading = ref(false);
const error = ref('');
const logContainer = ref<HTMLElement | null>(null);

/** 根据日志级别返回行样式（纯函数） */
function lineClass(line: LogLine): string {
  switch (line.level) {
    case 'error':
      return 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400';
    case 'warn':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
    default:
      return 'text-gray-600 dark:text-gray-300';
  }
}

/** 加载日志（副作用：发起 HTTP 请求） */
async function loadLogs() {
  loading.value = true;
  error.value = '';
  try {
    const resp = await $fetch<{
      success: boolean;
      data: { lines: LogLine[]; total: number; filtered: number; error?: string };
    }>('/api/web/data/v1/logs', {
      query: { type: activeType.value, limit: 500 },
    });

    if (resp?.success) {
      logLines.value = resp.data?.lines || [];
      if (resp.data?.error) {
        error.value = resp.data.error;
      }
      // 滚动到底部（最新日志在最后）
      await nextTick();
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    }
  } catch (e: any) {
    error.value = e?.message || '加载日志失败';
  } finally {
    loading.value = false;
  }
}

function switchType(type: string) {
  activeType.value = type;
  loadLogs();
}

onMounted(loadLogs);

useHead({ title: `操作日志 | ${websiteName}` });
</script>
