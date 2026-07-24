<template>
  <form @submit.prevent="search">
    <UInput
      icon="i-heroicons-magnifying-glass-20-solid"
      color="white"
      v-model="query"
      size="md"
      class="focus-within:w-[300px] w-[200px] transition-all duration-300 ease-in-out"
      :trailing="false"
      :placeholder="`搜索文章标题 (${metaSymbol}+K)`"
      ref="inputRef"
    />
  </form>
</template>

<script setup lang="ts">
const query = defineModel<string>();
const emit = defineEmits(['search']);

// 平台快捷键前缀符号（Mac 显示 ⌘，其他平台显示 Ctrl）
const metaSymbol: string = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

function search() {
  emit('search', query.value);
}

const inputRef = ref();

// 快捷键处理：Meta+K 聚焦搜索框，Esc 失焦（替代已移除的 useShortcuts/defineShortcuts）
function onKeydown(e: KeyboardEvent): void {
  const isShortcut = e.key === 'k' && (e.metaKey || e.ctrlKey);
  if (isShortcut) {
    e.preventDefault();
    inputRef.value?.input?.focus();
  }
  if (e.key === 'Escape') {
    inputRef.value?.input?.blur();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>
