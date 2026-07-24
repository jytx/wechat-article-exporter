<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface Props {
  params: ICellRendererParams & {
    onGotoLink?: (params: ICellRendererParams) => void;
    onPreview?: (params: ICellRendererParams) => void;
  };
}
const props = defineProps<Props>();

function gotoLink() {
  props.params.onGotoLink && props.params.onGotoLink(props.params);
}
function preview() {
  props.params.onPreview && props.params.onPreview(props.params);
}
</script>

<template>
  <div class="flex items-center justify-center">
    <ElTooltip content="访问原文" placement="top">
      <ElButton type="primary" circle text @click="gotoLink"
        ><template #icon><UIcon name="i-lucide:external-link" /></template></ElButton
      >
    </ElTooltip>
    <ElTooltip content="预览" placement="top">
      <ElButton
        type="primary"
        circle
        text
        :disabled="!params.data.contentDownload || params.data.downloading"
        @click="preview"
        ><template #icon><UIcon name="i-heroicons:fire-16-solid" /></template></ElButton
      >
    </ElTooltip>
  </div>
</template>
