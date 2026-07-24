<script setup lang="ts">
	import type { ICellRendererParams } from 'ag-grid-community';

	interface LoadValue {
	  count?: number;
	  total?: number;
	}

	interface Props {
	  // AG Grid 旧用法
	  params?: ICellRendererParams;
	  // el-table 新用法（直接传 { count, total }）
	  value?: LoadValue;
	}
	const props = defineProps<Props>();

	// 兼容两种入参：优先取 value，回退到 params.value
	const count = computed(() => {
	  if (props.value !== undefined) return props.value.count || 0;
	  return (props.params?.value as LoadValue | undefined)?.count || 0;
	});
	const total = computed(() => {
	  if (props.value !== undefined) return props.value.total || 0;
	  return (props.params?.value as LoadValue | undefined)?.total || 0;
	});
	</script>

	<template>
	  <div class="mt-0 flex items-center gap-2">
    <ElProgress
      :color="'#409eff'"
      :percentage="Math.round((total > 0 ? count : 0) / (total > 0 ? total : 1) * 100)"
      :show-text="false"
      :stroke-width="10"
      class="w-24"
    />
	    <span class="text-xs text-gray-500">
	      {{ total > 0 ? `${count}/${total}` : '0/0' }}
	    </span>
	  </div>
	</template>
