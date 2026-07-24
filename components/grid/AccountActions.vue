<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';
import { Loader } from 'lucide-vue-next';

interface SyncProgressData {
  synced: number;
  total: number;
  pages: number;
  incremental: boolean;
  message: string;
}

interface Props {
  params: ICellRendererParams & {
    onSync?: (params: ICellRendererParams) => void;
    onStop?: (params: ICellRendererParams) => void;
    isDeleting: boolean;
    isSyncing: boolean;
    syncingRowId: string | null;
    syncingFakeids?: Set<string>;
    /** 每个公众号的同步状态，区分排队/同步中/停止中 */
    taskStatusMap?: Map<string, 'pending' | 'running' | 'canceling'>;
    /** 同步实时进度（轮询更新） */
    syncProgressMap?: Map<string, SyncProgressData>;
  };
}
const props = defineProps<Props>();

function sync() {
  props.params.onSync && props.params.onSync(props.params);
}
function stop() {
  props.params.onStop && props.params.onStop(props.params);
}
const isDisabled = computed(() => props.params.isDeleting || props.params.isSyncing);

// 该行是否在活跃任务中（pending 或 running）
const isActive = computed(() => {
  const fid = props.params.node.id || '';
  if (props.params.syncingFakeids) {
    return props.params.syncingFakeids.has(fid);
  }
  return props.params.isSyncing && fid === props.params.syncingRowId;
});

/** 当前行的同步状态 */
const taskStatus = computed(() => {
  if (!isActive.value) return null;
  const fid = props.params.node.id || '';
  if (props.params.taskStatusMap) {
    return props.params.taskStatusMap.get(fid) || 'running';
  }
  return 'running';
});

/** 当前进度数据 */
const progress = computed<SyncProgressData | null>(() => {
  const fid = props.params.node.id || '';
  if (props.params.syncProgressMap) {
    return props.params.syncProgressMap.get(fid) || null;
  }
  return null;
});

/** 进度百分比（纯函数）—— 用页数比例，而非 synced/total */
const percent = computed(() => {
  if (!progress.value) return 0;
  // 用 pagesDone 和预估总页数（total/20 向上取整）算进度
  const pages = progress.value.pages || 0;
  const estTotalPages = progress.value.total > 0 ? Math.ceil(progress.value.total / 20) : 0;
  if (estTotalPages <= 0) return 0;
  return Math.min(100, Math.round((pages / estTotalPages) * 100));
});

/** 进度文字（纯函数）—— 显示页数 + 新增篇数 */
const progressText = computed(() => {
  if (!progress.value) return '';
  const parts: string[] = [];
  // 已处理页数 / 预估总页数
  if (progress.value.pages > 0) {
    const estTotalPages = progress.value.total > 0 ? Math.ceil(progress.value.total / 20) : 0;
    parts.push(estTotalPages > 0 ? `P${progress.value.pages}/${estTotalPages}` : `P${progress.value.pages}`);
  }
  // 新增篇数
  if (progress.value.synced > 0) {
    parts.push(`+${progress.value.synced}`);
  }
  return parts.join(' ');
});
</script>

<template>
  <div class="flex items-center justify-center gap-2">
    <!-- 停止中 -->
    <span v-if="taskStatus === 'canceling'" class="text-xs text-orange-500 whitespace-nowrap">停止中...</span>

    <!-- 排队中 -->
    <span v-else-if="taskStatus === 'pending'" class="text-xs text-gray-400 whitespace-nowrap">排队中</span>

    <!-- 增量同步：只显示 spinning + 停止按钮 -->
    <template v-else-if="isActive && progress?.incremental">
      <UButton color="green" size="xs" variant="solid" @click="stop">
        <Loader :size="12" class="animate-spin" />
        停止
      </UButton>
    </template>

    <!-- 全量同步：页数进度 + 新增数 + 停止按钮 -->
    <template v-else-if="isActive">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500 whitespace-nowrap font-mono">
          {{ progressText || '...' }}
        </span>
        <UButton color="green" size="xs" variant="solid" @click="stop">
          <Loader :size="12" class="animate-spin" />
        </UButton>
      </div>
    </template>

    <!-- 空闲：同步按钮 -->
    <UButton
      v-else
      icon="i-heroicons:arrow-path-rounded-square-20-solid"
      color="blue"
      size="xs"
      :disabled="isDisabled"
      @click="sync"
    ></UButton>
  </div>
</template>
