<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface ActionRow {
  link?: string;
  fakeid?: string;
  contentDownload?: boolean;
  downloading?: boolean;
  [key: string]: any;
}

interface Props {
  // AG Grid 旧用法（article.vue 仍在使用）
  params?: ICellRendererParams & {
    onGotoLink?: (params: ICellRendererParams) => void;
    onPreview?: (params: ICellRendererParams) => void;
    onAddAccount?: (params: ICellRendererParams) => void;
    isAccountManaged?: (fakeid: string) => boolean;
  };
  // el-table 新用法（single.vue）
  data?: ActionRow;
  onPreview?: (row: any) => void;
  onGotoLink?: (row: any) => void;
  onAddAccount?: (row: any) => void;
  isAccountManaged?: (fakeid: string) => boolean;
}
const props = defineProps<Props>();

const row = computed<ActionRow>(() => {
  if (props.data !== undefined) return props.data;
  return (props.params?.data ?? {}) as ActionRow;
});

const contentDownload = computed(() => !!row.value.contentDownload);
const downloading = computed(() => !!row.value.downloading);

/** 该公众号是否已在管理列表中 */
const accountManaged = computed(() => {
  const fid = row.value.fakeid;
  if (!fid || fid === 'unknown') return true;
  if (props.isAccountManaged) return props.isAccountManaged(fid);
  if (props.params?.isAccountManaged) return props.params.isAccountManaged(fid);
  return false;
});

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
function addAccount() {
  if (props.data !== undefined) {
    props.onAddAccount?.(row.value);
    return;
  }
  props.params?.onAddAccount && props.params.onAddAccount(props.params);
}
</script>

<template>
  <div class="flex items-center justify-center gap-1">
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
    <ElTooltip :content="accountManaged ? '公众号已管理' : '加入公众号管理'" placement="top">
      <ElButton
        type="success"
        circle
        text
        :disabled="accountManaged"
        @click="addAccount"
        ><template #icon><UIcon name="i-lucide:user-plus" /></template></ElButton
      >
    </ElTooltip>
  </div>
</template>
