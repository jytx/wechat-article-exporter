<template>
  <UCard>
    <template #header>
      <h3 class="text-2xl font-semibold">消息通知</h3>
      <p class="text-sm text-slate-10 font-serif">配置邮箱与 Webhook，在同步完成、登录过期等事件时接收通知</p>
    </template>

    <div class="flex flex-col space-y-6">
      <!-- 总开关 + 通知事件 -->
      <div class="flex flex-col gap-3">
        <UCheckbox v-model="config.enabled" name="notifEnabled" label="启用消息通知" />

        <div v-if="config.enabled" class="pl-6 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <p class="text-sm text-slate-500 mb-1">通知事件（勾选后，对应事件发生时推送通知）</p>
          <UCheckbox v-model="config.events.syncComplete" name="evSync" label="定时同步完成" />
          <UCheckbox v-model="config.events.sessionExpired" name="evSession" label="登录态过期" />
          <UCheckbox v-model="config.events.syncFailed" name="evFailed" label="同步失败告警" />
        </div>
      </div>

      <!-- SMTP 邮箱区 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <UCheckbox v-model="config.email.enabled" name="emailEnabled" label="SMTP 邮箱通知" />
          <UButton
            v-if="config.email.enabled"
            size="xs"
            color="gray"
            icon="i-lucide:send"
            :loading="testingEmail"
            :disabled="testingEmail"
            @click="testEmail"
          >
            测试发送
          </UButton>
        </div>

        <div v-if="config.email.enabled" class="flex flex-col gap-4">
          <div>
            <label class="block text-sm mb-1">SMTP 服务器</label>
            <UInput v-model="config.email.host" placeholder="smtp.qq.com" class="font-mono w-full max-w-md" />
          </div>
          <div class="flex items-end gap-4 flex-wrap">
            <div>
              <label class="block text-sm mb-1">端口</label>
              <UInput v-model.number="config.email.port" type="number" placeholder="465" class="font-mono w-24" />
            </div>
            <UCheckbox v-model="config.email.secure" name="emailSecure" label="SSL/TLS 加密" class="mb-2" />
            <span class="text-xs text-gray-400 mb-2">端口 465 通常开启，587 通常关闭</span>
          </div>
          <div class="flex gap-4 flex-wrap">
            <div class="flex-1 min-w-[200px]">
              <label class="block text-sm mb-1">发件邮箱账号</label>
              <UInput v-model="config.email.user" placeholder="user@qq.com" class="font-mono w-full" />
            </div>
            <div class="flex-1 min-w-[200px]">
              <label class="block text-sm mb-1">授权码 / 密码</label>
              <UInput v-model="config.email.pass" type="password" placeholder="SMTP 授权码" class="font-mono w-full" />
            </div>
          </div>
          <div class="flex gap-4 flex-wrap">
            <div>
              <label class="block text-sm mb-1">发件人名称</label>
              <UInput v-model="config.email.fromName" placeholder="微信文章导出器" class="w-52" />
            </div>
            <div class="flex-1 min-w-[200px]">
              <label class="block text-sm mb-1">收件邮箱</label>
              <UInput v-model="config.email.to" placeholder="多个用逗号分隔" class="font-mono w-full" />
            </div>
          </div>
        </div>
      </div>

      <!-- Webhook 区 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <UCheckbox v-model="config.webhook.enabled" name="webhookEnabled" label="Webhook 通知" />
          <UButton
            v-if="config.webhook.enabled"
            size="xs"
            color="gray"
            icon="i-lucide:send"
            :loading="testingWebhook"
            :disabled="testingWebhook"
            @click="testWebhook"
          >
            测试发送
          </UButton>
        </div>

        <div v-if="config.webhook.enabled" class="flex flex-col gap-4">
          <div>
            <label class="block text-sm mb-1">平台类型</label>
            <USelectMenu
              v-model="config.webhook.type"
              :options="WEBHOOK_OPTIONS"
              value-attribute="value"
              option-attribute="label"
              class="w-52"
            />
          </div>
          <div>
            <label class="block text-sm mb-1">Webhook URL</label>
            <UInput v-model="config.webhook.url" placeholder="https://..." class="font-mono w-full max-w-2xl" />
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import toastFactory from '~/composables/toast';
import type { NotificationConfig, WebhookType } from '~/types/notification';
import { createDefaultNotificationConfig } from '~/types/notification';

const toast = toastFactory();

/** Webhook 平台选项 */
const WEBHOOK_OPTIONS: ReadonlyArray<{ value: WebhookType; label: string }> = [
  { value: 'feishu', label: '飞书' },
  { value: 'wecom', label: '企业微信' },
  { value: 'custom', label: '自定义' },
];

/** 通知配置（组件自管，与 preferences 解耦） */
const config = reactive<NotificationConfig>(createDefaultNotificationConfig());

/** 暴露给父组件 saveAll 调用的保存函数 */
const saving = ref(false);
async function save() {
  saving.value = true;
  try {
    await $fetch('/api/web/data/v1/batch/notification', {
      method: 'PUT',
      body: config,
    });
    return true;
  } catch (e: any) {
    toast.error('通知配置保存失败', e?.message || '未知错误');
    return false;
  } finally {
    saving.value = false;
  }
}
defineExpose({ save });

// ========== 加载配置 ==========

async function loadConfig() {
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings',
      { query: { key: 'notification_config' } },
    );
    if (resp?.success && resp.data?.value) {
      const parsed = JSON.parse(resp.data.value) as Partial<NotificationConfig>;
      Object.assign(config, {
        enabled: parsed.enabled ?? config.enabled,
        events: { ...config.events, ...(parsed.events || {}) },
        email: { ...config.email, ...(parsed.email || {}) },
        webhook: { ...config.webhook, ...(parsed.webhook || {}) },
      });
    }
  } catch {
    // 静默失败，使用默认值
  }
}

// ========== 测试发送 ==========

const testingEmail = ref(false);
async function testEmail() {
  if (!config.email.host || !config.email.user || !config.email.to) {
    toast.warning('配置不完整', '请先填写 SMTP 服务器、账号和收件邮箱');
    return;
  }
  testingEmail.value = true;
  try {
    await $fetch('/api/web/data/v1/batch/notification-test', {
      method: 'POST',
      body: { channel: 'email' },
    });
    toast.success('发送成功', '测试邮件已发送，请检查收件箱（含垃圾邮件）');
  } catch (e: any) {
    toast.error('发送失败', e?.data?.message || e?.message || 'SMTP 配置可能有误');
  } finally {
    testingEmail.value = false;
  }
}

const testingWebhook = ref(false);
async function testWebhook() {
  if (!config.webhook.url) {
    toast.warning('配置不完整', '请先填写 Webhook URL');
    return;
  }
  testingWebhook.value = true;
  try {
    await $fetch('/api/web/data/v1/batch/notification-test', {
      method: 'POST',
      body: { channel: 'webhook' },
    });
    toast.success('发送成功', '测试 Webhook 已发送，请检查对应平台');
  } catch (e: any) {
    toast.error('发送失败', e?.data?.message || e?.message || 'Webhook URL 可能有误');
  } finally {
    testingWebhook.value = false;
  }
}

onMounted(loadConfig);
</script>
