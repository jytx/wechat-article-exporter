<template>
  <UCard>
    <template #header>
      <h3 class="text-2xl font-semibold">其他</h3>
    </template>

    <div class="flex flex-col space-y-5">
      <div class="flex gap-1">
        <UCheckbox v-model="preferences.hideDeleted" name="hideDeleted" label="隐藏已删除文章" />
        <UPopover mode="hover" :popper="{ placement: 'top' }">
          <template #panel>
            <p class="max-w-[300px] p-3 text-sm text-gray-500">
              是否在文章下载表格中显示已删除的文章。<br />
              若勾选该选项，则文章下载表格将过滤掉已经被删除的文章(无论文章内容是否已被下载)。
            </p>
          </template>
          <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
        </UPopover>
      </div>

      <div class="flex gap-1">
        <UCheckbox
          v-model="preferences.downloadConfig.forceDownloadContent"
          name="forceDownloadContent"
          label="强制下载文章内容"
        />
        <UPopover mode="hover" :popper="{ placement: 'top' }">
          <template #panel>
            <p class="max-w-[300px] p-3 text-sm text-gray-500">
              在抓取文章内容时，若该文章内容已被下载，则会跳过抓取过程。<br />
              若勾选该选项，则会忽略已缓存内容，强制重新下载最新文章内容。<br />
            </p>
          </template>
          <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
        </UPopover>
      </div>

      <div class="flex gap-1">
        <UCheckbox
          v-model="preferences.downloadConfig.metadataOverrideContent"
          name="metadataOverrideContent"
          label="抓取阅读量时是否覆盖文章内容"
        />
        <UPopover mode="hover" :popper="{ placement: 'top' }">
          <template #panel>
            <p class="max-w-[300px] p-3 text-sm text-gray-500">
              在抓取阅读量时，会同时下载文章内容。<br />
              若勾选该选项，则文章内容会同时保存到缓存中(会占用一定的存储空间)。
            </p>
          </template>
          <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
        </UPopover>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Preferences } from '~/types/preferences';

const preferences: Ref<Preferences> = usePreferences() as unknown as Ref<Preferences>;
</script>
