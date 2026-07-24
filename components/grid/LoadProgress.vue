<script setup lang="ts">
	import type { ICellRendererParams } from 'ag-grid-community';

	interface Props {
	  params: ICellRendererParams;
	}
	const props = defineProps<Props>();

	// valueGetter 返回 { count, total }
	const count = ref(props.params.value?.count || 0);
	const total = ref(props.params.value?.total || 0);

	function refresh(params: ICellRendererParams): boolean {
	  count.value = params.value?.count || 0;
	  total.value = params.value?.total || 0;
	  return true;
	}
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
