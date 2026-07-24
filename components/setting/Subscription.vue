<template>
  <UCard>
    <template #header>
      <h3 class="text-2xl font-semibold">文章订阅</h3>
      <p class="text-sm text-slate-10 font-serif">定时将最新同步的公众号文章通过邮件/Webhook 推送给你</p>
    </template>

    <div class="flex flex-col space-y-6">
      <!-- 总开关 -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <UCheckbox v-model="config.enabled" name="subEnabled" label="启用文章订阅" />
          <span v-if="config.enabled" class="text-sm text-green-500 font-medium">已启用</span>
          <span v-else class="text-sm text-slate-400 font-medium">未启用</span>
        </div>

        <div v-if="config.enabled" class="pl-6 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <!-- 通知配置状态检查 -->
          <p v-if="notifReady" class="text-xs text-green-500">
            ✅ 通知渠道已就绪（{{ notifReadyDetail }}）
          </p>
          <div v-else class="text-xs text-orange-500 bg-orange-50 dark:bg-orange-950/30 rounded px-3 py-2">
            ⚠️ 需先在下方「消息通知」中完成配置：
            <br />1. 勾选「启用消息通知」
            <br />2. 勾选「文章订阅推送」事件
            <br />3. 启用并配置 SMTP 邮箱或 Webhook
          </div>
        </div>
      </div>

      <!-- 推送配置 -->
      <div v-if="config.enabled" class="flex flex-col gap-4">
        <!-- Cron 表达式 -->
        <div>
          <label class="block text-sm mb-1">推送频率（Cron 表达式）</label>
          <div class="flex items-center gap-2 flex-wrap">
            <UInput v-model="config.cron" placeholder="0 9 * * *" class="w-52 font-mono" />
            <span class="text-xs text-gray-400">
              <button type="button" class="text-blue-500 hover:underline" @click="config.cron = '0 9 * * *'">每天9点</button> ·
              <button type="button" class="text-blue-500 hover:underline" @click="config.cron = '0 9 * * 1'">每周一</button> ·
              <button type="button" class="text-blue-500 hover:underline" @click="config.cron = '0 9,21 * * *'">每天9点和21点</button>
            </span>
          </div>
          <p class="mt-1 text-xs text-gray-400">当前生效：{{ config.cron }}</p>
        </div>

        <!-- 判断时间的字段 -->
        <div>
          <label class="block text-sm mb-1">时间依据</label>
          <USelectMenu
            v-model="config.timeField"
            :options="TIME_FIELD_OPTIONS"
            value-attribute="value"
            option-attribute="label"
            class="w-52"
          />
          <p class="mt-1 text-xs text-gray-400">
            <span v-if="config.timeField === 'create_time'">按文章发布时间过滤：只推最近 {{ config.days }} 天发布的文章，与同步时间无关</span>
            <span v-else>按入库时间去重：每篇文章只推一次，调高频率也不会重复</span>
          </p>
        </div>

        <!-- 时间范围 -->
        <div>
          <label class="block text-sm mb-1">时间范围</label>
          <UInput v-model.number="config.days" type="number" :min="1" :max="30" class="w-32 font-mono">
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">天</span>
            </template>
          </UInput>
          <p class="mt-1 text-xs text-gray-400">
            <span v-if="config.timeField === 'create_time'">推送最近 {{ config.days }} 天内发布的文章</span>
            <span v-else>首次推送回溯 {{ config.days }} 天入库的文章</span>
          </p>
        </div>

        <!-- 最大文章数 -->
        <div>
          <label class="block text-sm mb-1">单次最多推送</label>
          <UInput v-model.number="config.maxArticles" type="number" :min="1" :max="500" class="w-32 font-mono">
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">篇</span>
            </template>
          </UInput>
          <p class="mt-1 text-xs text-gray-400">超过此数量的文章不会包含在本次推送中</p>
        </div>

        <!-- 无新文章时跳过 -->
        <UCheckbox
          v-model="config.onlyNewArticles"
          name="onlyNew"
          label="没有新文章时不发送"
        />
      </div>

      <!-- 测试发送 -->
      <div v-if="config.enabled" class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <UButton
          size="xs"
          color="gray"
          icon="i-lucide:send"
          :loading="testing"
          :disabled="testing"
          @click="testSend"
        >
          立即发送一次（测试）
        </UButton>
        <p class="mt-1 text-xs text-gray-400">使用当前已保存的配置立即推送一次，不需要等 cron 触发</p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import toastFactory from '~/composables/toast';
import type { SubscriptionConfig, SubscriptionTimeField } from '~/types/subscription';
import { createDefaultSubscriptionConfig } from '~/types/subscription';

const toast = toastFactory();

/** 时间依据选项 */
const TIME_FIELD_OPTIONS: ReadonlyArray<{ value: SubscriptionTimeField; label: string }> = [
  { value: 'create_time', label: '文章发布时间' },
  { value: 'created_at', label: '文章入库时间' },
];

/** 订阅配置（组件自管，与 preferences 解耦） */
const config = reactive<SubscriptionConfig>(createDefaultSubscriptionConfig());

/** 暴露给父组件 saveAll 调用的保存函数 */
const saving = ref(false);
async function save() {
  saving.value = true;
  try {
    await $fetch('/api/web/data/v1/batch/subscription', {
      method: 'PUT',
      body: config,
    });
    return true;
  } catch (e: any) {
    toast.error('订阅配置保存失败', e?.message || '未知错误');
    return false;
  } finally {
    saving.value = false;
  }
}
defineExpose({ save });

// ========== 加载配置 ==========

/** 通知配置是否就绪（邮箱或 webhook 已启用 + articleDigest 事件已勾选） */
const notifReady = ref(false);
const notifReadyDetail = ref('');

async function checkNotifConfig() {
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings',
      { query: { key: 'notification_config' } },
    );
    if (!resp?.success || !resp.data?.value) {
      notifReady.value = false;
      return;
    }
    const cfg = JSON.parse(resp.data.value);
    const eventOn = cfg.events?.articleDigest === true;
    const emailOn = cfg.email?.enabled === true;
    const webhookOn = cfg.webhook?.enabled === true;
    notifReady.value = eventOn && (emailOn || webhookOn);
    if (notifReady.value) {
      const channels: string[] = [];
      if (emailOn) channels.push('邮箱');
      if (webhookOn) channels.push('Webhook');
      notifReadyDetail.value = channels.join(' + ');
    }
  } catch {
    notifReady.value = false;
  }
}

async function loadConfig() {
  try {
    const resp = await $fetch<{ success: boolean; data: { key: string; value: string } }>(
      '/api/web/data/v1/settings',
      { query: { key: 'article_subscription' } },
    );
    if (resp?.success && resp.data?.value) {
      const parsed = JSON.parse(resp.data.value) as Partial<SubscriptionConfig>;
      Object.assign(config, {
        enabled: parsed.enabled ?? config.enabled,
        cron: parsed.cron || config.cron,
        days: parsed.days ?? config.days,
        onlyNewArticles: parsed.onlyNewArticles ?? config.onlyNewArticles,
        maxArticles: parsed.maxArticles ?? config.maxArticles,
        timeField: parsed.timeField ?? config.timeField,
      });
    }
  } catch {
    // 静默失败，使用默认值
  }
}

// ========== 测试发送 ==========

const testing = ref(false);
async function testSend() {
  testing.value = true;
  try {
    const resp = await $fetch<{ success: boolean; message: string; data: { sent: boolean; articleCount: number; reason: string } }>(
      '/api/web/data/v1/batch/subscription-test',
      { method: 'POST' },
    );
    if (resp?.data?.sent) {
      toast.success('发送成功', `已推送 ${resp.data.articleCount} 篇文章`);
    } else {
      toast.info('未发送', resp?.data?.reason || resp?.message || '未知原因');
    }
  } catch (e: any) {
    toast.error('发送失败', e?.data?.message || e?.message || '请检查通知配置');
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  loadConfig();
  checkNotifConfig();
});
</script>
