<template>
  <div class="space-y-2">
    <div class="relative">
      <input
        ref="inputRef"
        v-model="keyword"
        type="text"
        placeholder="输入文章标题关键字搜索"
        class="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        @keydown.enter="handleSearch"
      />
      <button
        v-if="keyword"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        type="button"
        @click="clearInput"
      >
        <X class="size-5" />
      </button>
    </div>

    <!-- 搜索历史 -->
    <div v-if="searchHistory.length > 0 && !keyword" class="space-y-1">
      <p class="text-xs text-gray-500 dark:text-gray-400">搜索历史</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(item, index) in searchHistory"
          :key="index"
          class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          type="button"
          @click="useHistoryKeyword(item)"
        >
          {{ item }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  search: [];
}>();

const keyword = ref(props.modelValue);
const inputRef = ref<HTMLInputElement | null>(null);
const searchHistory = ref<string[]>([]);

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  newValue => {
    keyword.value = newValue;
  }
);

// 监听 keyword 变化，同步到父组件
watch(keyword, newValue => {
  emit('update:modelValue', newValue);
});

/**
 * 处理搜索
 */
function handleSearch() {
  const trimmed = keyword.value.trim();
  if (!trimmed) return;

  // 添加到搜索历史
  if (!searchHistory.value.includes(trimmed)) {
    searchHistory.value.unshift(trimmed);
    if (searchHistory.value.length > 10) {
      searchHistory.value = searchHistory.value.slice(0, 10);
    }
  }

  emit('search');
}

/**
 * 使用历史关键词
 */
function useHistoryKeyword(item: string) {
  keyword.value = item;
  emit('search');
}

/**
 * 清空输入
 */
function clearInput() {
  keyword.value = '';
  inputRef.value?.focus();
}

/**
 * 重置表单
 */
function reset() {
  keyword.value = '';
  searchHistory.value = [];
}

defineExpose({
  reset,
  focus: () => inputRef.value?.focus(),
});
</script>
