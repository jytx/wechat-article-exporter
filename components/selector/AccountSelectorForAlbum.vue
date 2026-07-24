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
        <ElAvatar v-if="account.round_head_img" :src="IMAGE_PROXY + account.round_head_img" size="small" />
        <div class="flex flex-col">
          <span class="text-[15px] text-gray-900">{{ account.nickname }}</span>
          <span class="text-xs text-gray-400">合集数: {{ account.albums?.length || 0 }}</span>
        </div>
      </div>
    </ElOption>
  </ElSelect>
</template>

<script setup lang="ts">
	import { IMAGE_PROXY } from '~/config';
	import type { Account } from '~/types/api';
	import { useAccountApi } from '~/composables/useAccountApi';
	import { useArticleApi } from '~/composables/useArticleApi';
	import type { AppMsgAlbumInfo } from '~/types/types';

	interface AccountInfo extends Account {
	  albums?: AppMsgAlbumInfo[];
	}

	// 使用 API 获取数据
	const { getAccounts } = useAccountApi();
	const { getAlbums } = useArticleApi();
	const loading = ref(false);

	// 公众号信息（包含合集）
	const accountInfos = ref<AccountInfo[]>([]);

	// 加载公众号和合集数据
	async function loadAccountsWithAlbums() {
	  loading.value = true;
	  try {
	    // 获取公众号列表
	    const accountsResult = await getAccounts({ page: 1, pageSize: 100000 });

	    // 为每个公众号获取合集信息
	    const accountsWithAlbums: AccountInfo[] = [];
	    for (const account of accountsResult.items) {
	      try {
	        // 直接获取该公众号的合集列表
	        const albums = await getAlbums(account.fakeid);

			accountsWithAlbums.push({
			  ...account,
			  albums
			});
		      } catch (error) {
			console.error(`获取公众号 [${account.fakeid}] 合集失败:`, error);
			accountsWithAlbums.push({
			  ...account,
			  albums: []
			});
		      }
		    }

	    accountInfos.value = accountsWithAlbums;
	  } catch (error) {
	    console.error('加载公众号列表失败:', error);
	    accountInfos.value = [];
	  } finally {
	    loading.value = false;
	  }
	}

	// 组件挂载时加载数据
	onMounted(() => {
	  loadAccountsWithAlbums();
	});

	// 按合集数排序
	const sortedAccountInfos = computed(() => {
	  const sorted = [...accountInfos.value];
	  sorted.sort((a, b) => {
	    const aAlbums = (a.albums?.length || 0);
	    const bAlbums = (b.albums?.length || 0);
	    return bAlbums - aAlbums;
	  });
	  return sorted;
	});

	const selected = defineModel<AccountInfo | undefined>();

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
</script>
