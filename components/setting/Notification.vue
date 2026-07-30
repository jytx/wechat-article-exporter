<template>
  <ElCard>
    <template #header>
      <BaseSettingCardHeader
        icon="i-lucide:bell"
        icon-color="#ff9f0a"
        title="消息通知"
        description="配置邮箱与 Webhook，在同步完成、登录过期等事件时接收通知"
      />
    </template>

    <div class="flex flex-col space-y-6">
      <!-- 总开关 + 通知事件 -->
      <div class="flex flex-col gap-3">
        <ElCheckbox v-model="config.enabled" name="notifEnabled">启用消息通知</ElCheckbox>

        <div v-if="config.enabled" class="pl-6 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <p class="text-sm text-slate-500 mb-1">通知事件（勾选后，对应事件发生时推送通知）</p>
          <ElCheckbox v-model="config.events.syncComplete" name="evSync">定时同步完成</ElCheckbox>
          <ElCheckbox v-model="config.events.sessionExpired" name="evSession">登录态过期</ElCheckbox>

          <!-- 登录态过期探活频率配置：仅在勾选「登录态过期」时展开 -->
          <div v-if="config.events.sessionExpired" class="pl-6 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2 py-1">
            <p class="text-xs text-slate-500">探活频率：系统按此间隔主动检查公众号登录态，过期时推送一次提醒</p>
            <div class="flex items-center gap-2 flex-wrap">
              <ElCheckbox v-model="probeSchedule.enabled" name="probeEnabled">启用定时探活</ElCheckbox>
              <ElInput
                v-model="probeSchedule.cron"
                placeholder="0 * * * *"
                class="font-mono"
                style="width: 180px"
              />
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs text-slate-400">快捷预设：</span>
              <ElButton
                v-for="preset in PROBE_PRESETS"
                :key="preset.cron"
                size="small"
                link
                :type="probeSchedule.cron === preset.cron ? 'primary' : ''"
                @click="probeSchedule.cron = preset.cron"
              >
                {{ preset.label }}
              </ElButton>
            </div>
          </div>
          <ElCheckbox v-model="config.events.syncFailed" name="evFailed">同步失败告警</ElCheckbox>
          <ElCheckbox v-model="config.events.articleDigest" name="evDigest">文章订阅推送</ElCheckbox>
        </div>
      </div>

      <!-- SMTP 邮箱区 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <ElCheckbox v-model="config.email.enabled" name="emailEnabled">SMTP 邮箱通知</ElCheckbox>
          <ElButton
            v-if="config.email.enabled"
            size="small"
            :loading="testingEmail"
            :disabled="testingEmail"
            @click="testEmail"
          >
            <template #icon><UIcon name="i-lucide:send" /></template>
            测试发送
          </ElButton>
        </div>

        <div v-if="config.email.enabled" class="flex flex-col gap-4">
          <div>
            <label class="block text-sm mb-1">SMTP 服务器</label>
            <ElInput v-model="config.email.host" placeholder="smtp.qq.com" style="width: 300px" class="font-mono" />
          </div>
          <div>
            <label class="block text-sm mb-1">端口</label>
            <ElInput v-model.number="config.email.port" type="number" placeholder="465" style="width: 300px" class="font-mono" />
          </div>
          <div>
            <ElCheckbox v-model="config.email.secure" name="emailSecure">SSL/TLS 加密</ElCheckbox>
            <span class="text-xs text-gray-400 ml-2">端口 465 通常开启，587 通常关闭</span>
          </div>
          <div>
            <label class="block text-sm mb-1">发件邮箱账号</label>
            <ElInput v-model="config.email.user" placeholder="user@qq.com" style="width: 300px" class="font-mono" />
          </div>
          <div>
            <label class="block text-sm mb-1">授权码 / 密码</label>
            <ElInput v-model="config.email.pass" type="password" placeholder="SMTP 授权码" style="width: 300px" class="font-mono" />
          </div>
          <div>
            <label class="block text-sm mb-1">发件人名称</label>
            <ElInput v-model="config.email.fromName" placeholder="微信文章导出器" style="width: 300px" />
          </div>
          <div>
            <label class="block text-sm mb-1">收件邮箱</label>
            <ElInput v-model="config.email.to" placeholder="多个用逗号分隔" style="width: 300px" class="font-mono" />
          </div>
        </div>
      </div>

      <!-- Webhook 区 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <ElCheckbox v-model="config.webhook.enabled" name="webhookEnabled">Webhook 通知</ElCheckbox>
          <ElButton
            v-if="config.webhook.enabled"
            size="small"
            :loading="testingWebhook"
            :disabled="testingWebhook"
            @click="testWebhook"
          >
            <template #icon><UIcon name="i-lucide:send" /></template>
            测试发送
          </ElButton>
        </div>

        <div v-if="config.webhook.enabled" class="flex flex-col gap-4">
          <div>
            <label class="block text-sm mb-1">平台类型</label>
            <ElSelect
              v-model="config.webhook.type"
              style="width: 180px"
            >
              <ElOption
                v-for="item in WEBHOOK_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </div>
          <div>
            <label class="block text-sm mb-1">Webhook URL</label>
            <ElInput v-model="config.webhook.url" placeholder="https://..." style="width: 400px" class="font-mono" />
          </div>
        </div>
      </div>
    </div>
  </ElCard>
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

/** 登录态探活调度配置（独立于通知配置，单独存于 session_probe_schedule） */
const probeSchedule = reactive({ enabled: true, cron: '0 * * * *' });

/** 探活频率快捷预设 */
const PROBE_PRESETS: ReadonlyArray<{ cron: string; label: string }> = [
  { cron: '*/30 * * * *', label: '每 30 分钟' },
  { cron: '0 * * * *', label: '每小时' },
  { cron: '0 */6 * * *', label: '每 6 小时' },
];

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

// 自动保存：config 变化后防抖触发（复用已有的 save 方法）
let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _configLoaded = false;
watch(config, () => {
  // 跳过首次加载时的触发（loadConfig 赋值会触发 watch）
  if (!_configLoaded) return;
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => save(), 800);
}, { deep: true });

// ========== 探活配置自动保存 ==========

let _probeSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _probeLoaded = false;
async function saveProbeSchedule() {
  try {
    await $fetch('/api/web/data/v1/batch/session-probe', {
      method: 'PUT',
      body: { enabled: probeSchedule.enabled, cron: probeSchedule.cron },
    });
  } catch (e: any) {
    toast.error('探活配置保存失败', e?.data?.message || e?.message || '未知错误');
  }
}
watch(probeSchedule, () => {
  // 跳过首次加载时的触发
  if (!_probeLoaded) return;
  if (_probeSaveTimer) clearTimeout(_probeSaveTimer);
  _probeSaveTimer = setTimeout(() => saveProbeSchedule(), 800);
}, { deep: true });

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
  } finally {
    // 标记加载完成，之后 config 变化才触发自动保存
    _configLoaded = true;
  }

  // 加载探活配置（与通知配置并行，互不阻塞）
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings',
      { query: { key: 'session_probe_schedule' } },
    );
    if (resp?.success && resp.data?.value) {
      const parsed = JSON.parse(resp.data.value) as { enabled?: boolean; cron?: string };
      probeSchedule.enabled = parsed.enabled !== false;
      if (typeof parsed.cron === 'string' && parsed.cron.trim()) probeSchedule.cron = parsed.cron.trim();
    }
  } catch {
    // 静默失败，使用默认值
  } finally {
    _probeLoaded = true;
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
