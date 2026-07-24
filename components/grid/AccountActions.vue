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

interface AccountLike {
  fakeid?: string;
  [key: string]: any;
}

interface CommonSyncContext {
  isDeleting?: boolean;
  isSyncing?: boolean;
  syncingRowId?: string | null;
  syncingFakeids?: Set<string>;
  /** 每个公众号的同步状态，区分排队/同步中/停止中 */
  taskStatusMap?: Map<string, 'pending' | 'running' | 'canceling'>;
  /** 同步实时进度（轮询更新） */
  syncProgressMap?: Map<string, SyncProgressData>;
}

interface Props {
  // AG Grid 旧用法（保留兼容）
  params?: ICellRendererParams & {
    onSync?: (params: ICellRendererParams) => void;
    onStop?: (params: ICellRendererParams) => void;
  } & CommonSyncContext;
  // el-table 新用法（account.vue）
  data?: AccountLike;
  onSync?: (data: any) => void;
  onStop?: (data: any) => void;
  context?: CommonSyncContext;
}
const props = defineProps<Props>();

/** 统一的同步上下文（AG Grid params 或 el-table context） */
const ctx = computed<CommonSyncContext>(() => {
  if (props.data !== undefined) return props.context ?? {};
  return (props.params as any) ?? {};
});

/** 当前行的 fakeid */
const fid = computed(() => {
  if (props.data !== undefined) return props.data?.fakeid || '';
  // AG Grid 模式下使用 node.id（实为 getRowId 返回的 fakeid）
  return props.params?.node?.id || props.params?.data?.fakeid || '';
});

function sync() {
  if (props.data !== undefined) {
    props.onSync?.(props.data as AccountLike);
    return;
  }
  props.params?.onSync && props.params.onSync(props.params!);
}
function stop() {
  if (props.data !== undefined) {
    props.onStop?.(props.data as AccountLike);
    return;
  }
  props.params?.onStop && props.params.onStop(props.params!);
}
const isDisabled = computed(() => !!ctx.value.isDeleting || !!ctx.value.isSyncing);

/** 当前行是否在活跃任务中（pending 或 running） */
const isActive = computed(() => {
  const id = fid.value;
  if (ctx.value.syncingFakeids) {
    return ctx.value.syncingFakeids.has(id);
  }
  return !!ctx.value.isSyncing && id === ctx.value.syncingRowId;
});

/** 当前行是否在活跃任务中（pending 或 running） */
const taskStatus = computed(() => {
  if (!isActive.value) return null;
  const id = fid.value;
  if (ctx.value.taskStatusMap) {
    return ctx.value.taskStatusMap.get(id) || 'running';
  }
  return 'running';
});

/** 当前进度数据 */
const progress = computed<SyncProgressData | null>(() => {
  const id = fid.value;
  if (ctx.value.syncProgressMap) {
    return ctx.value.syncProgressMap.get(id) || null;
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
      <ElButton type="success" size="small" @click="stop">
        <Loader :size="12" class="animate-spin" />
        停止
      </ElButton>
    </template>

    <!-- 全量同步：页数进度 + 新增数 + 停止按钮 -->
    <template v-else-if="isActive">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500 whitespace-nowrap font-mono">
          {{ progressText || '...' }}
        </span>
        <ElButton type="success" size="small" @click="stop">
          <Loader :size="12" class="animate-spin" />
        </ElButton>
      </div>
    </template>

    <!-- 空闲：同步按钮 -->
    <ElButton
      v-else
      type="primary"
      size="small"
      :disabled="isDisabled"
      @click="sync"
      ><template #icon><UIcon name="i-heroicons:arrow-path-rounded-square-20-solid" /></template></ElButton
    >
  </div>
</template>
