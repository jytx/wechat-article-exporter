<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">设置</h1>
    </Teleport>

    <div class="flex flex-col h-full">
      <!-- 顶部操作区 -->
      <header class="flex items-center justify-end gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <ElButton
          :loading="saving"
          :disabled="saving"
          type="primary"
          @click="saveAll"
          ><template #icon><UIcon name="i-lucide:save" /></template>{{ saving ? '保存中...' : '保存全部' }}</ElButton
        >
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-4 space-y-6">
          <!-- 代理节点 -->
          <SettingProxy />

          <!-- 导出选项 -->
          <SettingExport />

          <!-- 文章同步 -->
          <SettingSync />

          <!-- 消息通知 -->
          <SettingNotification ref="notificationRef" />

          <!-- 文章订阅 -->
          <SettingSubscription ref="subscriptionRef" />

          <!-- 其他设置 -->
          <SettingMisc />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';
import toastFactory from '~/composables/toast';
import type { Preferences } from '~/types/preferences';
import usePreferences from '~/composables/usePreferences';

const toast = toastFactory();
const preferences = usePreferences() as unknown as Ref<Preferences>;
const saving = ref(false);
/** 消息通知组件引用（调用其 save 方法保存通知配置） */
const notificationRef = ref<{ save: () => Promise<boolean> } | null>(null);
/** 文章订阅组件引用（调用其 save 方法保存订阅配置） */
const subscriptionRef = ref<{ save: () => Promise<boolean> } | null>(null);

async function saveAll() {
  saving.value = true;
  let okCount = 0;
  let failCount = 0;

  // 1. 保存 preferences（代理、导出、其他等通用设置）
  try {
    const items = [
      { key: 'hide_deleted', value: String(preferences.value.hideDeleted) },
      { key: 'sync_date_range', value: preferences.value.syncDateRange },
      { key: 'sync_date_point', value: String(preferences.value.syncDatePoint) },
      { key: 'account_sync_seconds', value: String(preferences.value.accountSyncSeconds) },
      { key: 'proxy_list', value: JSON.stringify(preferences.value.privateProxyList) },
      { key: 'proxy_authorization', value: preferences.value.privateProxyAuthorization },
      { key: 'export_config', value: JSON.stringify(preferences.value.exportConfig) },
      { key: 'download_config', value: JSON.stringify(preferences.value.downloadConfig) },
    ];
    await $fetch('/api/web/data/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items }),
    });
    okCount++;
  } catch (e: any) {
    failCount++;
    console.error('通用设置保存失败:', e);
  }

  // 2. 保存自动同步配置（Sync 组件的 syncSchedule）
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings?key=article_sync_schedule',
    );
    if (resp?.success && resp.data?.value) {
      const cfg = JSON.parse(resp.data.value);
      await $fetch('/api/web/data/v1/batch/sync-schedule', {
        method: 'PUT',
        body: { enabled: cfg.enabled, cron: cfg.cron },
      });
    }
    okCount++;
  } catch (e) {
    // sync-schedule 可能没改过，忽略
  }

  // 3. 保存消息通知配置（Notification 组件）
  if (notificationRef.value) {
    const ok = await notificationRef.value.save();
    if (ok) {
      okCount++;
    } else {
      failCount++;
    }
  }

  // 4. 保存文章订阅配置（Subscription 组件）
  if (subscriptionRef.value) {
    const ok = await subscriptionRef.value.save();
    if (ok) {
      okCount++;
    } else {
      failCount++;
    }
  }

  saving.value = false;
  if (failCount === 0) {
    toast.success('保存成功', '所有设置已保存');
  } else if (okCount > 0) {
    toast.warning('部分保存成功', `${okCount} 项成功，${failCount} 项失败`);
  } else {
    toast.error('保存失败', '请检查网络或服务状态');
  }
}

useHead({
  title: `设置 | ${websiteName}`,
});
</script>
