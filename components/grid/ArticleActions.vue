<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface ActionRow {
  link?: string;
  contentDownload?: boolean;
  downloading?: boolean;
  [key: string]: any;
}

interface Props {
  // AG Grid 旧用法（article.vue 仍在使用）
  params?: ICellRendererParams & {
    onGotoLink?: (params: ICellRendererParams) => void;
    onPreview?: (params: ICellRendererParams) => void;
  };
  // el-table 新用法（single.vue）
  data?: ActionRow;
  onPreview?: (row: any) => void;
  onGotoLink?: (row: any) => void;
}
const props = defineProps<Props>();

const row = computed<ActionRow>(() => {
  if (props.data !== undefined) return props.data;
  return (props.params?.data ?? {}) as ActionRow;
});

const contentDownload = computed(() => !!row.value.contentDownload);
const downloading = computed(() => !!row.value.downloading);

function gotoLink() {
  if (props.data !== undefined) {
    props.onGotoLink?.(row.value);
    return;
  }
  props.params?.onGotoLink && props.params.onGotoLink(props.params);
}
function preview() {
  if (props.data !== undefined) {
    props.onPreview?.(row.value);
    return;
  }
  props.params?.onPreview && props.params.onPreview(props.params);
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
        :disabled="!contentDownload || downloading"
        @click="preview"
        ><template #icon><UIcon name="i-heroicons:fire-16-solid" /></template></ElButton
      >
    </ElTooltip>
  </div>
</template>
