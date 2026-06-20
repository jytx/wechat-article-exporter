<template>
  <UCard class="mx-4 mt-10 flex-1">
    <template #header>
      <h3 class="text-2xl font-semibold">其他</h3>
    </template>

    <div class="flex">
      <div class="flex-1 flex flex-col space-y-3">
        <div>
          <p class="mb-2 flex items-center gap-3">
            <span>导出路径:</span>
            <span class="text-xs text-gray-500">(服务端文件系统路径，所有导出文件将保存到此目录)</span>
            <UPopover mode="hover" :popper="{ placement: 'top' }">
              <template #panel>
                <p class="max-w-[300px] p-3 text-sm text-gray-500">
                  设置导出文件的服务端保存路径。例如：<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs">./exports</code> 或 <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs">/home/user/downloads</code>。<br />
                  路径相对于项目根目录或使用绝对路径。确保服务端有该目录的写入权限。
                </p>
              </template>
              <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
            </UPopover>
          </p>
          <UInput
            placeholder="导出路径"
            v-model="preferences.exportConfig.exportPath"
            class="w-[600px] font-mono"
          />
        </div>

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
      <div class="flex-1">
        <div>
          <p class="flex">
            <span class="text-sm">公众号同步频率：</span>
            <UPopover mode="hover" :popper="{ placement: 'top' }">
              <template #panel>
                <p class="max-w-[300px] p-3 text-sm text-gray-500">
                  在同步公众号文章数据时，程序会自动抓取该公众号的所有文章，直到所有数据同步完成。<br />
                  该选项用于控制抓取频率，比如设置为 5
                  就表示每五秒抓取一次。该数据越小，同步的越快，但是容易被封号。推荐不小于3
                </p>
              </template>
              <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
            </UPopover>
          </p>
          <UInput
            type="number"
            v-model="preferences.accountSyncSeconds"
            placeholder="配置公众号同步频率"
            class="w-52 font-mono"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">秒</span>
            </template>
          </UInput>
        </div>
      </div>
    </div>
    <div class="border border-slate-200 p-3 rounded-md mt-5">
      <p class="flex justify-between items-center mb-3">
        <span class="text-xl font-medium">
          同步时间范围:
          <span class="text-xs text-slate-500">(说明: 只能从当前时间开始往前同步)</span>
        </span>
        <span class="text-sm text-blue-500 font-medium">实际同步范围: {{ getActualDateRange() }}</span>
      </p>

      <div class="flex gap-3">
        <USelectMenu
          class="w-1/2"
          v-model="preferences.syncDateRange"
          :options="DURATION_OPTIONS"
          value-attribute="value"
          option-attribute="label"
        />
        <UPopover v-if="preferences.syncDateRange === 'point'" :popper="{ placement: 'bottom-start' }">
          <UButton color="gray" icon="i-heroicons:calendar-days-20-solid" :label="formatDate()" />

          <template #panel="{ close }">
            <BaseDatePicker v-model="preferences.syncDatePoint" is-required @close="close" />
          </template>
        </UPopover>
      </div>
    </div>

    <!-- 自动同步设置 -->
    <div class="border border-slate-200 p-3 rounded-md mt-5">
      <p class="flex justify-between items-center mb-3">
        <span class="text-xl font-medium">
          自动同步:
          <span class="text-xs text-slate-500">(服务运行期间按 cron 定时自动同步所有公众号)</span>
        </span>
        <span v-if="syncSchedule.enabled" class="text-sm text-green-500 font-medium">已启用</span>
        <span v-else class="text-sm text-slate-400 font-medium">未启用</span>
      </p>

      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <UCheckbox
            v-model="syncSchedule.enabled"
            name="autoSyncEnabled"
            label="启用定时自动同步"
          />
          <UPopover mode="hover" :popper="{ placement: 'top' }">
            <template #panel>
              <p class="max-w-[320px] p-3 text-sm text-gray-500">
                勾选后，服务运行期间会按设置的 cron 定时自动同步所有公众号的最新文章。<br />
                需要保持服务运行，且至少有过一次扫码登录（登录态过期后需重新扫码）。
              </p>
            </template>
            <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
          </UPopover>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm w-20">Cron 表达式</span>
          <UInput
            v-model="syncSchedule.cron"
            placeholder="0 3 * * *"
            class="w-52 font-mono"
            :disabled="!syncSchedule.enabled"
          />
          <span class="text-xs text-gray-400">
            <button
              type="button"
              class="text-blue-500 hover:underline"
              :disabled="!syncSchedule.enabled"
              @click="syncSchedule.cron = '0 3 * * *'"
            >每天3点</button> ·
            <button
              type="button"
              class="text-blue-500 hover:underline"
              :disabled="!syncSchedule.enabled"
              @click="syncSchedule.cron = '0 */6 * * *'"
            >每6小时</button> ·
            <button
              type="button"
              class="text-blue-500 hover:underline"
              :disabled="!syncSchedule.enabled"
              @click="syncSchedule.cron = '0 9,21 * * *'"
            >每天9点和21点</button>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            size="sm"
            :loading="savingSchedule"
            @click="saveSyncSchedule"
          >保存配置</UButton>
          <span v-if="syncSchedule.enabled" class="text-xs text-gray-400">
            当前生效：{{ syncSchedule.cron }}
          </span>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import toastFactory from '~/composables/toast';
import type { Preferences } from '~/types/preferences';

const toast = toastFactory();

const { getActualDateRange, getSelectOptions } = useSyncDeadline();

const preferences: Ref<Preferences> = usePreferences() as unknown as Ref<Preferences>;

const DURATION_OPTIONS = getSelectOptions();

function formatDate() {
  return dayjs.unix(preferences.value.syncDatePoint).format('YYYY-MM-DD');
}

// ========== 自动同步配置 ==========
const syncSchedule = reactive({
  enabled: false,
  cron: '0 3 * * *',
});
const savingSchedule = ref(false);

async function loadSyncSchedule() {
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings?key=article_sync_schedule',
    );
    if (resp?.success && resp.data?.value) {
      const cfg = JSON.parse(resp.data.value);
      syncSchedule.enabled = cfg.enabled === true;
      syncSchedule.cron = cfg.cron || '0 3 * * *';
    }
  } catch {
    // 静默失败
  }
}

async function saveSyncSchedule() {
  savingSchedule.value = true;
  try {
    await $fetch('/api/web/data/v1/batch/sync-schedule', {
      method: 'PUT',
      body: {
        enabled: syncSchedule.enabled,
        cron: syncSchedule.cron,
      },
    });
    toast.success('保存成功', syncSchedule.enabled ? `自动同步已启用：${syncSchedule.cron}` : '自动同步已禁用');
  } catch (e: any) {
    toast.error('保存失败', e?.message || '配置保存失败');
  } finally {
    savingSchedule.value = false;
  }
}

onMounted(() => {
  loadSyncSchedule();
});
</script>
