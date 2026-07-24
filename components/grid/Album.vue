<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface AlbumItem {
  id: string | number;
  title: string;
}

interface Props {
  // AG Grid 旧用法（保留兼容）
  params?: ICellRendererParams;
  // el-table 新用法：直接传合集列表
  albums?: AlbumItem[];
  // el-table 新用法：传整行数据，内部取 appmsg_album_infos（兼容旧字段名）
  data?: { appmsg_album_infos?: AlbumItem[] };
}
const props = defineProps<Props>();

const albums = computed<AlbumItem[]>(() => {
  if (props.albums !== undefined) return props.albums;
  const source = props.data?.appmsg_album_infos ?? (props.params?.data as any)?.appmsg_album_infos;
  return Array.isArray(source) ? source : [];
});
</script>

<template>
  <p class="flex flex-wrap">
    <span v-for="album in albums" :key="album.id" class="text-blue-600 mr-2">#{{ album.title }}</span>
  </p>
</template>
