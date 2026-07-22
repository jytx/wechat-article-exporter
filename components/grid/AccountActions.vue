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
    /** 每个公众号的同步状态（fakeid -> 'pending' | 'running'），区分排队/同步中 */
    taskStatusMap?: Map<string, 'pending' | 'running'>;
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

// 该行是排队中（pending）还是同步中（running）
const isPending = computed(() => {
  if (!isActive.value) return false;
  const fid = props.params.node.id || '';
  if (props.params.taskStatusMap) {
    return props.params.taskStatusMap.get(fid) === 'pending';
  }
  return false;
});
</script>

<template>
  <div class="flex items-center justify-center gap-3">
    <!-- 排队中：显示文字，不转圈 -->
    <span v-if="isPending" class="text-xs text-gray-400">排队中</span>
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
