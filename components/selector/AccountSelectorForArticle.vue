<template>
  <USelectMenu
    v-model="selected"
    size="md"
    color="gray"
    searchable
    searchable-placeholder="筛选公众号..."
    clear-search-on-close
    :options="sortedAccountInfos"
    option-attribute="nickname"
    placeholder="请选择公众号"
    :loading="loading"
  >
    <template #label>
      <UAvatar v-if="selected && selected.fakeid" :src="selected.round_head_img" size="2xs" />
      <span v-if="selected" class="max-w-30 line-clamp-1">{{ selected.nickname }}</span>
      <span v-if="selected && selected.fakeid" class="shrink-0">({{ selected.synced_count }}篇)</span>
      <span v-if="selected && !selected.fakeid" class="shrink-0">共 {{ selected.synced_count }}篇</span>
    </template>
    <template #option="{ option: account }">
      <UAvatar :src="account.round_head_img" size="sm" />
      <div>
        <p class="text-[16px]">{{ account.nickname }}</p>
        <p class="text-gray-500 text-sm">已加载文章数: {{ account.synced_count }}</p>
      </div>
    </template>
    <template #option-empty="{ query }">
      未找到匹配「{{ query }}」的公众号<br />请先在「<NuxtLink
        to="/dashboard/account"
        class="text-blue-500 hover:underline"
        >公众号管理</NuxtLink
      >」中添加
    </template>
    <template #empty>
      暂无公众号，请先在「<NuxtLink to="/dashboard/account" class="text-blue-500 hover:underline">公众号管理</NuxtLink
      >」中添加
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
	import type { Account } from '~/types/api';
	import { useAccountApi } from '~/composables/useAccountApi';

	// 使用 API 获取公众号列表
	const { getAccounts } = useAccountApi();
	const loading = ref(false);

	// 公众号信息
	const accountInfos = ref<Account[]>([]);

	// 加载公众号列表
	async function loadAccounts() {
	  loading.value = true;
	  try {
	    const result = await getAccounts({ page: 1, pageSize: 1000 });
	    accountInfos.value = result.items;
	  } catch (error) {
	    console.error('加载公众号列表失败:', error);
	    accountInfos.value = [];
	  } finally {
	    loading.value = false;
	  }
	}

	// 组件挂载时加载数据
	onMounted(() => {
	  loadAccounts();
	});

	// 按文章数排序，添加"全部"选项
	const sortedAccountInfos = computed(() => {
	  // 确保不会因为 null 导致错误
	  const accounts = accountInfos.value || [];

	  const allOption = {
	    fakeid: '',
	    nickname: '全部公众号',
	    synced_count: accounts.reduce((sum, acc) => sum + (acc.synced_count || 0), 0),
	    round_head_img: '',
	  };

	  const sorted = [...accounts];
	  sorted.sort((a, b) => {
	    return (b.synced_count || 0) - (a.synced_count || 0);
	  });

	  return [allOption, ...sorted];
	});

	const selected = defineModel<Account | undefined>();

// 监听账号列表加载完成，自动选择"全部公众号"
watch(accountInfos, (newAccounts) => {
  if (newAccounts.length > 0 && !selected.value) {
    // 如果当前没有选中任何账号，自动选择"全部公众号"
    selected.value = sortedAccountInfos.value[0];
  }
}, { immediate: true });
</script>
