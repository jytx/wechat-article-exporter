<template>
  <div class="px-2">
    <!-- 搜索输入框 -->
    <div class="relative">
      <ElInput
        v-model="searchQuery"
        placeholder="搜索公众号名称或微信号..."
        @keyup.enter="handleSearch"
      >
        <template #suffix>
          <ElButton text @click="handleSearch"
            ><template #icon><UIcon name="i-lucide:search" /></template></ElButton
          >
        </template>
      </ElInput>

      <!-- 清除按钮 -->
      <button
        v-if="searchQuery"
        @click="clearSearch"
        class="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <UIcon name="i-heroicons-x-mark-20-solid" class="w-4 h-4" />
      </button>
    </div>

    <!-- 历史搜索记录 -->
    <div v-if="showHistory && searchHistory.length > 0" class="mt-2">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 font-medium">搜索历史</span>
        <button
          @click="clearHistory"
          class="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          清空
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(item, index) in searchHistory"
          :key="index"
          @click="selectHistory(item)"
          class="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          <UIcon name="i-lucide:clock" class="w-3 h-3 text-gray-500" />
          <span class="text-gray-700">{{ item }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'search', query: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const searchQuery = ref(props.modelValue);

// 历史搜索记录（最多保存 10 条）
const searchHistory = ref<string[]>([]);
const HISTORY_KEY = 'account-search-history';
const MAX_HISTORY = 10;

// 是否显示历史记录
const showHistory = ref(true);

// 加载历史记录
function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      searchHistory.value = JSON.parse(saved);
    }
  } catch (error) {
    console.error('加载搜索历史失败:', error);
  }
}

// 保存历史记录
function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value));
  } catch (error) {
    console.error('保存搜索历史失败:', error);
  }
}

// 验证搜索关键词是否有效
function isValidSearchKeyword(query: string): boolean {
  if (!query || typeof query !== 'string') return false;

  const trimmedQuery = query.trim();

  // 检查长度：微信搜索 API 限制
  if (trimmedQuery.length === 0 || trimmedQuery.length > 100) return false;

  // 检查是否包含有效字符（至少一个中文字符、英文字母或数字）
  const hasValidChar = /[\u4e00-\u9fa5a-zA-Z0-9]/.test(trimmedQuery);

  return hasValidChar;
}

// 添加到历史记录
function addToHistory(query: string) {
  if (!isValidSearchKeyword(query)) return;

  const trimmedQuery = query.trim();

  // 移除重复项
  const index = searchHistory.value.indexOf(trimmedQuery);
  if (index > -1) {
    searchHistory.value.splice(index, 1);
  }

  // 添加到开头
  searchHistory.value.unshift(trimmedQuery);

  // 限制数量
  if (searchHistory.value.length > MAX_HISTORY) {
    searchHistory.value = searchHistory.value.slice(0, MAX_HISTORY);
  }

  saveHistory();
}

// 选择历史记录
function selectHistory(item: string) {
  searchQuery.value = item;
  showHistory.value = false;
  handleSearch();
}

// 清空历史
function clearHistory() {
  searchHistory.value = [];
  saveHistory();
}

// 清除搜索
function clearSearch() {
  searchQuery.value = '';
  showHistory.value = true;
  emit('update:modelValue', '');
}

// 处理搜索
function handleSearch() {
  const query = searchQuery.value.trim();

  // 验证搜索关键词
  if (!isValidSearchKeyword(query)) {
    console.warn('[SearchAccountForm] 无效的搜索关键词:', query);
    return;
  }

  addToHistory(query);
  showHistory.value = false;
  emit('search', query);
}

// 监听 modelValue 变化
watch(() => props.modelValue, newValue => {
  searchQuery.value = newValue;
  // 当输入框有内容时，隐藏历史记录
  showHistory.value = !newValue || newValue.trim().length === 0;
});

// 监听输入框变化
watch(searchQuery, newValue => {
  emit('update:modelValue', newValue);
  // 当输入框为空时，显示历史记录
  showHistory.value = !newValue || newValue.trim().length === 0;
});

// 初始化加载历史记录
loadHistory();

defineExpose({
  clearSearch,
  reset: () => {
    searchQuery.value = '';
    showHistory.value = true;
  }
});
</script>
