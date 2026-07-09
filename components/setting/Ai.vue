<template>
  <UCard class="mx-4 mt-10 flex-1">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-2xl font-semibold flex items-center gap-2">
          <UIcon name="i-lucide:sparkles" class="size-6 text-indigo-500" />
          AI 自动选题
        </h3>
        <UButton
          :loading="saving"
          icon="i-lucide:save"
          color="indigo"
          size="sm"
          @click="save"
          >保存配置</UButton
        >
      </div>
    </template>

    <div v-if="loading" class="py-10 text-center text-gray-400">加载配置中...</div>

    <div v-else class="flex flex-col gap-6">
      <!-- AI 模型配置 -->
      <div class="border border-slate-200 dark:border-slate-700 rounded-md p-4">
        <h4 class="text-lg font-medium mb-3">AI 模型配置</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">服务商</label>
            <USelect v-model="cfg.aiConfig.provider" :options="providerOptions" option-attribute="label" value-attribute="value" />
          </div>
          <div>
            <label class="block text-sm mb-1">模型名称</label>
            <UInput v-model="cfg.aiConfig.model" class="font-mono" placeholder="如 deepseek-chat" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm mb-1">
              API Key
              <UBadge v-if="cfg.aiConfig.hasApiKey" color="green" variant="subtle" size="xs" class="ml-1">已配置</UBadge>
            </label>
            <UInput
              v-model="cfg.aiConfig.apiKey"
              type="password"
              class="font-mono"
              :placeholder="cfg.aiConfig.hasApiKey ? '✓ 已保存。留空表示不修改，输入新值则覆盖' : '请输入 API Key，如 sk-...'"
            />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm mb-1">API Base URL</label>
            <UInput v-model="cfg.aiConfig.baseUrl" class="font-mono" placeholder="https://api.deepseek.com/v1" />
          </div>
          <div>
            <label class="block text-sm mb-1">生成选题数量</label>
            <UInput v-model.number="cfg.aiConfig.suggestionCount" type="number" :min="1" :max="10" class="w-32" />
          </div>
          <div>
            <label class="block text-sm mb-1">分析文章的时间范围</label>
            <USelect v-model.number="cfg.aiConfig.articleDays" :options="articleDaysOptions" option-attribute="label" value-attribute="value" class="w-40" />
          </div>
          <div>
            <label class="block text-sm mb-1">喂给 AI 的最大文章数</label>
            <UInput v-model.number="cfg.aiConfig.articleLimit" type="number" :min="5" :max="30" class="w-32" />
            <p class="text-xs text-gray-400 mt-1">喂正文时建议 ≤15 篇（每篇正文约 3000 token，过多会超模型上下文）</p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm mb-1">自定义 System Prompt（可选，留空用默认）</label>
            <UTextarea v-model="cfg.aiConfig.systemPrompt" :rows="3" class="w-full" placeholder="留空则使用内置的科技主编人设 prompt" />
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          支持任何兼容 OpenAI 协议的服务（minimax、deepseek、openai、moonshot、本地 ollama 等）。切换服务商后会自动填充常用 Base URL。
        </p>
      </div>

      <!-- 邮件配置 -->
      <div class="border border-slate-200 dark:border-slate-700 rounded-md p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-lg font-medium">邮件推送</h4>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="cfg.emailConfig.enabled" label="启用邮件推送" />
            <UButton
              icon="i-lucide:mail"
              size="xs"
              color="gray"
              variant="soft"
              :loading="testingEmail"
              :disabled="!cfg.emailConfig.smtpHost"
              @click="testEmail"
              >发送测试邮件</UButton
            >
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">SMTP 主机</label>
            <UInput v-model="cfg.emailConfig.smtpHost" class="font-mono" placeholder="smtp.qq.com" />
          </div>
          <div>
            <label class="block text-sm mb-1">SMTP 端口</label>
            <UInput v-model.number="cfg.emailConfig.smtpPort" type="number" class="w-32" />
          </div>
          <div>
            <label class="block text-sm mb-1">用户名</label>
            <UInput v-model="cfg.emailConfig.smtpUser" class="font-mono" />
          </div>
          <div>
            <label class="block text-sm mb-1">
              密码 / 授权码
              <UBadge v-if="cfg.emailConfig.hasSmtpPass" color="green" variant="subtle" size="xs" class="ml-1">已配置</UBadge>
            </label>
            <UInput
              v-model="cfg.emailConfig.smtpPass"
              type="password"
              class="font-mono"
              :placeholder="cfg.emailConfig.hasSmtpPass ? '✓ 已保存。留空表示不修改，输入新值则覆盖' : '邮箱授权码'"
            />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm mb-1">发件人地址（留空则用用户名）</label>
            <UInput v-model="cfg.emailConfig.from" class="font-mono" placeholder="user@qq.com" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm mb-1">收件人（多个用英文逗号分隔）</label>
            <UInput v-model="emailToText" class="font-mono" placeholder="a@xx.com, b@xx.com" />
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="cfg.emailConfig.smtpSecure" label="使用 SSL（465 端口勾选；587 端口不勾）" />
          </div>
        </div>
      </div>

      <!-- 定时任务 -->
      <div class="border border-slate-200 dark:border-slate-700 rounded-md p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-lg font-medium">定时生成</h4>
          <UCheckbox v-model="cfg.topicSchedule.enabled" label="启用定时任务" />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm">Cron 表达式</label>
          <UInput v-model="cfg.topicSchedule.cron" class="font-mono w-52" placeholder="0 9 * * *" />
          <span class="text-xs text-gray-500">默认每天 9:00（标准 5 段式：分 时 日 月 周）</span>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          注意：定时任务依赖 Node 运行时，Cloudflare Pages 部署不支持。Docker / 自有服务器部署可用。
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { useAiTopicApi, type TopicConfig } from '~/composables/useAiTopicApi';
import toastFactory from '~/composables/toast';

const toast = toastFactory();
const topicApi = useAiTopicApi();

const loading = ref(true);
const saving = ref(false);
const testingEmail = ref(false);
// 加载配置期间禁止 provider 的 watch 自动填充预设，避免把用户自定义的 model/baseUrl 覆盖掉
let skipProviderWatch = true;
const cfg = ref<TopicConfig>({
  aiConfig: { provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', suggestionCount: 5, systemPrompt: '', articleDays: 7, articleLimit: 10 },
  emailConfig: { enabled: false, smtpHost: '', smtpPort: 465, smtpSecure: true, smtpUser: '', smtpPass: '', from: '', to: [] },
  topicSchedule: { enabled: false, cron: '0 9 * * *' },
});

// 收件人文本与数组互转
const emailToText = computed({
  get: () => (cfg.value.emailConfig.to || []).join(', '),
  set: (val: string) => {
    cfg.value.emailConfig.to = String(val)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },
});

const providerOptions = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'MiniMax', value: 'minimax' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Moonshot (Kimi)', value: 'moonshot' },
  { label: '通义千问 (DashScope)', value: 'qwen' },
  { label: '自定义', value: 'custom' },
];

// 分析文章的时间范围选项（天）。0 = 不限时间，取全部
const articleDaysOptions = [
  { label: '最近 1 天', value: 1 },
  { label: '最近 3 天', value: 3 },
  { label: '最近 7 天', value: 7 },
  { label: '最近 14 天', value: 14 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
  { label: '全部（不限时间）', value: 0 },
];

// 切换服务商时填充常用 baseUrl / model
const providerPresets: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.7' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
};
watch(
  () => cfg.value.aiConfig.provider,
  (newVal, oldVal) => {
    if (skipProviderWatch) return;
    if (newVal === oldVal) return;
    const preset = providerPresets[newVal];
    if (preset) {
      cfg.value.aiConfig.baseUrl = preset.baseUrl;
      cfg.value.aiConfig.model = preset.model;
    }
  }
);

async function loadConfig() {
  loading.value = true;
  skipProviderWatch = true; // 加载期间禁止 watch 覆盖 model/baseUrl
  try {
    const data = await topicApi.getConfig();
    // apiKey 后端返回脱敏占位 '********'，不要填进输入框（password 框显示圆点会让人困惑）。
    // 用 hasApiKey 标识状态，输入框保持真空；用户想改 key 时才往里输入。
    if (data.aiConfig.apiKey === '********') {
      data.aiConfig.apiKey = '';
    }
    if (data.emailConfig.smtpPass === '********') {
      data.emailConfig.smtpPass = '';
    }
    cfg.value = data;
    // 等 cfg 赋值触发的 watch 回调执行完，再放开（用 nextTick 保证晚于本次响应式刷新）
    await nextTick();
  } catch (e: any) {
    toast.error('加载配置失败', e?.message);
  } finally {
    loading.value = false;
    skipProviderWatch = false; // 之后只有用户手动切换 provider 才填充预设
  }
}

async function save() {
  saving.value = true;
  try {
    // 脱敏占位不回传密钥（留空，后端检测到空/'********' 会保留原值）
    const payload: TopicConfig = JSON.parse(JSON.stringify(cfg.value));
    if (payload.aiConfig.apiKey === '********') payload.aiConfig.apiKey = '';
    if (payload.emailConfig.smtpPass === '********') payload.emailConfig.smtpPass = '';
    await topicApi.saveConfig(payload);
    toast.success('配置已保存');
    await loadConfig(); // 重新拉取脱敏状态
  } catch (e: any) {
    toast.error('保存失败', e?.message);
  } finally {
    saving.value = false;
  }
}

async function testEmail() {
  testingEmail.value = true;
  try {
    // 把当前表单（未保存的）配置传给后端测试
    const ec = cfg.value.emailConfig;
    const payload = {
      smtpHost: ec.smtpHost,
      smtpPort: ec.smtpPort,
      smtpSecure: ec.smtpSecure,
      smtpUser: ec.smtpUser,
      smtpPass: ec.smtpPass === '********' ? '' : ec.smtpPass,
      from: ec.from,
      to: ec.to,
    };
    await topicApi.sendTestEmail(payload);
    toast.success('测试邮件已发送', '请到收件箱（含垃圾箱）查收');
  } catch (e: any) {
    toast.error('发送失败', e?.message);
  } finally {
    testingEmail.value = false;
  }
}

onMounted(loadConfig);
</script>
