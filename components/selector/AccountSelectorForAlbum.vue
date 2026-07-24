<template>
  <ElSelect
    v-model="selected"
    size="default"
    filterable
    placeholder="请选择公众号"
    :loading="loading"
    class="w-full"
  >
    <ElOption
      v-for="account in sortedAccountInfos"
      :key="account.fakeid"
      :label="account.nickname"
      :value="account"
    >
      <ElAvatar :src="IMAGE_PROXY + account.round_head_img" size="small" />
      <div>
        <p class="text-[16px]">{{ account.nickname }}</p>
        <p class="text-gray-500 text-sm">合集数: {{ account.albums?.length || 0 }}</p>
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
</script>
