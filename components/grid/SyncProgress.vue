<script setup lang="ts">
/**
 * 同步进度展示组件
 *
 * 在操作列中替代纯 spinning loader，展示实时进度：
 * - running：进度条 + 数字（已同步/总数，第N页）+ 停止按钮
 * - pending：排队中文字
 * - canceling：停止中文字
 * - 空闲：不渲染（由 AccountActions 渲染同步按钮）
 */
import { Loader } from 'lucide-vue-next';

const props = defineProps<{
  synced: number;
  total: number;
  pages: number;
}>();

/** 进度百分比（纯函数，0-100） */
const percent = computed(() => {
  if (props.total <= 0) return 0;
  return Math.min(100, Math.round((props.synced / props.total) * 100));
});
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- 进度条 -->
    <div class="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
      <div
        class="h-full bg-green-500 rounded-full transition-all duration-500"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
    <!-- 数字 -->
    <span class="text-xs text-gray-500 whitespace-nowrap font-mono">
      {{ synced }}/{{ total > 0 ? total : '?' }}
    </span>
    <span v-if="pages > 0" class="text-xs text-gray-400 whitespace-nowrap">
      第{{ pages }}页
    </span>
  </div>
</template>
