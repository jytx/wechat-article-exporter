<template>
  <ElSelect
    v-model="selectedFakeid"
    size="default"
    filterable
    placeholder="请选择公众号"
    :loading="loading"
    class="w-full"
    @change="onChange"
  >
    <ElOption
      v-for="account in sortedAccountInfos"
      :key="account.fakeid"
      :label="account.nickname"
      :value="account.fakeid"
    >
      <div class="flex items-center gap-2">
        <ElAvatar v-if="account.round_head_img" :src="account.round_head_img" size="small" />
        <div class="flex flex-col">
          <span class="text-[15px] text-gray-900">{{ account.nickname }}</span>
          <span class="text-xs text-gray-400">已加载文章数: {{ account.synced_count }}</span>
        </div>
      </div>
    </ElOption>
  </ElSelect>
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

	// 按文章数排序，添加"全部"和"未管理"特殊选项
	const sortedAccountInfos = computed(() => {
		// 确保不会因为 null 导致错误
		const accounts = accountInfos.value || [];

		const allOption = {
			fakeid: '',
			nickname: '全部公众号',
			synced_count: accounts.reduce((sum, acc) => sum + (acc.synced_count || 0), 0),
			round_head_img: '',
		};

		// 特殊选项：仅查公众号未入库的「孤儿」文章（与后端 articles.get 的 __unmanaged__ 约定一致）
		const unmanagedOption = {
			fakeid: '__unmanaged__',
			nickname: '📨 未管理的文章',
			synced_count: 0,
			round_head_img: '',
		};

		const sorted = [...accounts];
		sorted.sort((a, b) => {
			return (b.synced_count || 0) - (a.synced_count || 0);
		});

		return [allOption, unmanagedOption, ...sorted];
	});

	// 父组件 v-model 绑定的是完整 Account 对象
	const selected = defineModel<Account | undefined>();

	// 内部用 fakeid 标量做选中值（避免 ElSelect 对象引用比较失败）
	const selectedFakeid = ref<string>('');

	// selected 变化时同步到 selectedFakeid（父→子）
	watch(selected, (val) => {
		selectedFakeid.value = val?.fakeid ?? '';
	}, { immediate: true });

	// 选择变化时找到完整对象同步给父组件（子→父）
	function onChange(fakeid: string): void {
		const account = sortedAccountInfos.value.find(a => a.fakeid === fakeid);
		selected.value = account;
	}

	// 监听账号列表加载完成，自动选择"全部公众号"
	watch(accountInfos, (newAccounts) => {
		if (newAccounts.length > 0 && !selected.value) {
			selected.value = sortedAccountInfos.value[0];
			selectedFakeid.value = '';
		}
	}, { immediate: true });
</script>
