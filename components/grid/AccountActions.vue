<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';
import { Loader } from 'lucide-vue-next';

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

// 该行是排队中（pending）还是同步中（running）还是停止中（canceling）
const taskStatus = computed(() => {
  if (!isActive.value) return null;
  const fid = props.params.node.id || '';
  if (props.params.taskStatusMap) {
    return props.params.taskStatusMap.get(fid) || 'running';
  }
  return 'running';
});
</script>

<template>
  <div class="flex items-center justify-center gap-3">
    <!-- 停止中：等服务端确认取消完成 -->
    <span v-if="taskStatus === 'canceling'" class="text-xs text-orange-500">停止中...</span>
    <!-- 排队中：显示文字，不转圈 -->
    <span v-else-if="taskStatus === 'pending'" class="text-xs text-gray-400">排队中</span>
    <!-- 同步中：显示停止按钮 -->
    <UButton v-else-if="isActive" color="green" size="xs" variant="solid" @click="stop">
      <Loader :size="14" class="animate-spin" />
      停止</UButton
    >
    <!-- 空闲：显示同步按钮 -->
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
