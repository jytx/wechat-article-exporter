<template>
  <UCard>
    <template #header>
      <h3 class="text-2xl font-semibold">文章同步</h3>
      <p class="text-sm text-slate-10 font-serif">公众号文章的同步频率与定时任务配置</p>
    </template>

    <div class="flex flex-col space-y-6">
      <!-- 同步频率 -->
      <div>
        <p class="mb-2 flex items-center gap-1">
          <span class="text-sm">同步频率：</span>
          <UPopover mode="hover" :popper="{ placement: 'top' }">
            <template #panel>
              <p class="max-w-[300px] p-3 text-sm text-gray-500">
                每翻一页文章列表后的等待秒数，用于防止请求过快被微信限流。<br />
                推荐范围 3-10 秒。小于 3 秒容易触发风控，大于 10 秒会导致多公众号批量同步非常慢。
              </p>
            </template>
            <UIcon color="gray" name="i-heroicons:question-mark-circle-16-solid" class="size-5" />
          </UPopover>
        </p>
        <UInput
          type="number"
          v-model="preferences.accountSyncSeconds"
          placeholder="3-10"
          class="w-52 font-mono"
          :min="1"
          :max="60"
        >
          <template #trailing>
            <span class="text-gray-500 dark:text-gray-400 text-xs">秒</span>
          </template>
        </UInput>
        <p v-if="syncSecondsWarning" class="mt-1 text-xs text-orange-500">{{ syncSecondsWarning }}</p>
      </div>

      <!-- 同步时间范围 -->
      <div>
        <p class="mb-2 flex items-center justify-between">
          <span class="text-sm">
            同步时间范围:
            <span class="text-xs text-slate-500">(只能从当前时间开始往前同步)</span>
          </span>
          <span class="text-sm text-blue-500 font-medium">{{ getActualDateRange() }}</span>
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

      <!-- 自动同步 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <p class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium">
            自动同步:
            <span class="text-xs text-slate-500 font-normal">(服务运行期间按 cron 定时自动同步所有公众号)</span>
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
              <button type="button" class="text-blue-500 hover:underline" :disabled="!syncSchedule.enabled" @click="syncSchedule.cron = '0 3 * * *'">每天3点</button> ·
              <button type="button" class="text-blue-500 hover:underline" :disabled="!syncSchedule.enabled" @click="syncSchedule.cron = '0 */6 * * *'">每6小时</button> ·
              <button type="button" class="text-blue-500 hover:underline" :disabled="!syncSchedule.enabled" @click="syncSchedule.cron = '0 9,21 * * *'">每天9点和21点</button>
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span v-if="syncSchedule.enabled" class="text-xs text-gray-400">
              当前生效：{{ syncSchedule.cron }}
            </span>
            <span v-else class="text-xs text-gray-400">未启用</span>
          </div>
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

/** 同步频率异常值警告（纯函数，不修改入参） */
const syncSecondsWarning = computed<string>(() => {
  const v = preferences.value.accountSyncSeconds;
  if (!v || v < 1) return '同步频率必须大于 0';
  if (v < 3) return '小于 3 秒容易触发微信风控，建议增大';
  if (v > 10) return `当前 ${v} 秒/页，批量同步多个公众号时会非常慢（如 5 页 × 10 个 = ${(v * 5 * 10 / 60).toFixed(0)} 分钟）`;
  return '';
});

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
      body: { enabled: syncSchedule.enabled, cron: syncSchedule.cron },
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
