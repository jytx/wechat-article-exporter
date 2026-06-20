<script setup lang="ts">
import { Sparkles, RefreshCw, Mail, AlertCircle, CheckCircle2, Loader2, Eye } from 'lucide-vue-next';
import { websiteName } from '~/config';
import { useAiTopicApi, type AiTopic, type TopicTask, type TopicTaskTrace, type TopicRun } from '~/composables/useAiTopicApi';
import toastFactory from '~/composables/toast';

useHead({ title: `AI 自动选题 | ${websiteName}` });

const toast = toastFactory();
const topicApi = useAiTopicApi();

// ========== 任务状态 ==========
const generating = ref(false);
const currentTask = ref<TopicTask | null>(null);
const currentTaskId = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

// 最近一次分析的过程（任务完成后保留，供「查看上次分析」入口使用）
const lastTrace = ref<TopicTaskTrace | null>(null);
const lastTraceTaskId = ref<string | null>(null);

// 已耗时（秒），任务运行期间每秒刷新，让用户知道没卡住
const elapsed = ref(0);
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
function startElapsed() {
  stopElapsed();
  elapsed.value = 0;
  elapsedTimer = setInterval(() => {
    elapsed.value++;
  }, 1000);
}
function stopElapsed() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

const phaseLabel: Record<TopicTask['phase'], string> = {
  loading_articles: '加载文章',
  calling_ai: 'AI 分析中',
  saving: '保存选题',
  sending_email: '发送邮件',
  done: '已完成',
};

// ========== 选题列表 ==========
const topics = ref<AiTopic[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const totalPages = ref(0);
const loading = ref(false);
const lastGeneratedAt = ref<number | null>(null);

// ========== 批量选择 / 删除 ==========
const selectedIds = ref<Set<number>>(new Set());
const deleting = ref(false);

/** 把扁平选题列表按日期分组（YYYY-MM-DD） */
interface TopicGroup {
  date: string; // YYYY-MM-DD
  dateLabel: string; // 展示用的中文日期
  items: AiTopic[];
}
const topicGroups = computed<TopicGroup[]>(() => {
  const map = new Map<string, AiTopic[]>();
  for (const t of topics.value) {
    const ts = (t.created_at || 0) * 1000;
    const d = new Date(ts);
    if (!d.getTime()) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  // Map 保持插入顺序，topics 本身已时间倒序，所以天然按日期倒序
  return Array.from(map.entries()).map(([date, items]) => {
    const [y, m, d] = date.split('-').map(Number);
    return { date, dateLabel: `${y}年${m}月${d}日`, items };
  });
});

/** 当前页是否全选 */
const allSelected = computed(
  () => topics.value.length > 0 && topics.value.every(t => t.id != null && selectedIds.value.has(t.id))
);
/** 是否半选（部分选中） */
const someSelected = computed(() => selectedIds.value.size > 0 && !allSelected.value);

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allSelected.value) {
    // 取消当前页的选中
    const next = new Set(selectedIds.value);
    for (const t of topics.value) if (t.id != null) next.delete(t.id);
    selectedIds.value = next;
  } else {
    // 选中当前页全部
    const next = new Set(selectedIds.value);
    for (const t of topics.value) if (t.id != null) next.add(t.id);
    selectedIds.value = next;
  }
}

function clearSelection() {
  selectedIds.value = new Set();
}

async function batchDelete() {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) return;
  if (!confirm(`确认删除选中的 ${ids.length} 条选题？此操作不可撤销。`)) return;
  deleting.value = true;
  try {
    const res = await topicApi.deleteTopics(ids);
    toast.success('删除成功', `已删除 ${res.deleted} 条`);
    clearSelection();
    // 若当前页删空了且不是第一页，回退一页
    if (topics.value.length === ids.length && currentPage.value > 1) {
      currentPage.value--;
    }
    await loadTopics();
    await loadStatus();
  } catch (e: any) {
    toast.error('删除失败', e?.message);
  } finally {
    deleting.value = false;
  }
}

// ========== 分析过程弹窗 ==========
const traceOpen = ref(false);
const traceLoading = ref(false);
// 弹窗里展示的统一结构（实时 trace 或历史 run 都映射成这个）
interface TraceView {
  source: 'live' | 'history';
  model?: string;
  provider?: string;
  status?: string;
  error?: string;
  systemPrompt?: string;
  userMessage?: string;
  rawResponse?: string;
  durationMs?: number;
  attempts?: number;
  promptTokens?: number;
  completionTokens?: number;
  inputArticleCount?: number;
  suggestionCount?: number;
  createdAt?: number;
}
const traceView = ref<TraceView | null>(null);
// 弹窗内 tab：prompt / 原始返回
const traceTab = ref<'prompt' | 'response'>('prompt');

/** 从实时任务 trace 打开弹窗 */
function openLiveTrace() {
  if (!currentTask.value?.trace) {
    toast.info('暂无分析过程', 'AI 分析开始后才有数据');
    return;
  }
  const t = currentTask.value.trace;
  traceView.value = {
    source: 'live',
    model: t.model,
    provider: t.provider,
    status: currentTask.value.status,
    systemPrompt: t.systemPrompt,
    userMessage: t.userMessage,
    rawResponse: t.rawResponse,
    durationMs: t.durationMs,
    attempts: t.attempts,
    promptTokens: t.promptTokens,
    completionTokens: t.completionTokens,
    inputArticleCount: currentTask.value.totalArticles,
    suggestionCount: currentTask.value.suggestionCount,
  };
  traceTab.value = 'prompt';
  traceOpen.value = true;
}

/**
 * 打开「上次分析」过程：
 * - 若当前有内存 trace（刚生成过），直接用它
 * - 否则用 currentTask.batchId 拉历史 run 详情
 */
async function openLastTrace() {
  if (lastTrace.value) {
    const t = lastTrace.value;
    traceView.value = {
      source: 'live',
      model: t.model,
      provider: t.provider,
      status: currentTask.value?.status,
      systemPrompt: t.systemPrompt,
      userMessage: t.userMessage,
      rawResponse: t.rawResponse,
      durationMs: t.durationMs,
      attempts: t.attempts,
      promptTokens: t.promptTokens,
      completionTokens: t.completionTokens,
      inputArticleCount: currentTask.value?.totalArticles,
      suggestionCount: currentTask.value?.suggestionCount,
    };
    traceTab.value = 'prompt';
    traceOpen.value = true;
    return;
  }
  const batchId = currentTask.value?.batchId;
  if (batchId) {
    await openHistoryTrace(batchId);
  } else {
    toast.info('暂无可查看的分析', '生成一次选题后才有分析过程数据');
  }
}

/** 从历史批次拉取 run 详情并打开弹窗 */
async function openHistoryTrace(batchId: string) {
  traceLoading.value = true;
  traceOpen.value = true;
  try {
    const detail = await topicApi.getRunDetail(batchId);
    if (!detail.found || !detail.run) {
      toast.warning('未找到分析记录', '该批次可能无过程数据');
      traceView.value = { source: 'history' };
      return;
    }
    const r = detail.run;
    traceView.value = {
      source: 'history',
      model: r.model,
      provider: r.provider,
      status: r.status,
      error: r.error,
      systemPrompt: r.system_prompt,
      userMessage: r.user_message,
      rawResponse: r.raw_response,
      durationMs: r.duration_ms,
      attempts: r.attempts,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      inputArticleCount: r.input_article_count,
      suggestionCount: r.suggestion_count,
      createdAt: r.created_at,
    };
    traceTab.value = 'prompt';
  } catch (e: any) {
    toast.error('加载分析过程失败', e?.message);
    traceOpen.value = false;
  } finally {
    traceLoading.value = false;
  }
}

// ========== 解析 JSON 字段 ==========
function parseKeywords(t: AiTopic): string[] {
  if (!t.keywords) return [];
  try {
    return JSON.parse(t.keywords);
  } catch {
    return [];
  }
}

function parseReferences(t: AiTopic): Array<{ title?: string; link?: string; source?: string }> {
  if (!t.references) return [];
  try {
    return JSON.parse(t.references);
  } catch {
    return [];
  }
}

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN', { hour12: false });
}

// ========== 触发生成 ==========
async function startGenerate() {
  if (generating.value) return;
  generating.value = true;
  startElapsed();
  // 立即重置任务状态为"启动中"，避免 UI 残留上一次任务的信息造成困惑
  currentTask.value = {
    id: '',
    trigger: 'manual',
    status: 'running',
    phase: 'loading_articles',
    message: '正在启动生成任务...',
    totalArticles: 0,
    suggestionCount: 0,
    emailSent: null,
    failedSources: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  try {
    const res = await topicApi.generate();
    currentTaskId.value = res.taskId;
    if (res.alreadyRunning) {
      toast.info('已有任务在运行', '正在查询进度...');
    } else {
      toast.success('已开始生成', 'AI 正在分析公众号文章，通常需要 30-60 秒，请耐心等待');
    }
    startPolling(res.taskId);
  } catch (e: any) {
    generating.value = false;
    stopElapsed();
    currentTask.value = null;
    toast.error('启动失败', e?.message);
  }
}

function startPolling(taskId: string) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const task = await topicApi.getStatus(taskId) as TopicTask;
      currentTask.value = task;
      // 只要 trace 出现就持续保存，避免任务结束后进度条消失导致 trace 丢失
      if (task.trace) {
        lastTrace.value = task.trace;
        lastTraceTaskId.value = task.id;
      }
      if (task.status === 'completed' || task.status === 'failed') {
        stopPolling();
        stopElapsed();
        generating.value = false;
        if (task.status === 'completed') {
          const emailHint = task.emailSent === true ? '，邮件已发送' : '';
          toast.success('选题生成完成', `共 ${task.suggestionCount} 个建议${emailHint}`);
          currentPage.value = 1;
          await loadTopics();
          await loadStatus();
        } else {
          toast.error('生成失败', task.error || task.message);
        }
      }
    } catch (e: any) {
      console.warn('轮询任务状态失败:', e?.message);
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ========== 加载选题列表 ==========
async function loadTopics() {
  loading.value = true;
  try {
    const res = await topicApi.listTopics({ page: currentPage.value, pageSize: pageSize.value });
    topics.value = res.items || [];
    total.value = res.pagination?.total || 0;
    totalPages.value = res.pagination?.totalPages || 0;
  } catch (e: any) {
    toast.error('加载失败', e?.message);
  } finally {
    loading.value = false;
  }
}

async function loadStatus() {
  try {
    const res = await topicApi.getStatus() as { active: number; tasks: TopicTask[]; lastGeneratedAt: number | null };
    lastGeneratedAt.value = res.lastGeneratedAt;
    // 若服务端已有运行中的任务，恢复轮询
    const active = res.tasks?.find(t => t.status === 'running' || t.status === 'pending');
    if (active) {
      currentTaskId.value = active.id;
      currentTask.value = active;
      generating.value = true;
      startPolling(active.id);
    }
  } catch {
    // 忽略
  }
}

function goPrev() {
  if (currentPage.value > 1) {
    currentPage.value--;
    clearSelection();
    loadTopics();
  }
}
function goNext() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    clearSelection();
    loadTopics();
  }
}

onMounted(async () => {
  await Promise.all([loadTopics(), loadStatus()]);
});

onBeforeUnmount(() => {
  stopPolling();
  stopElapsed();
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶部工具栏 -->
    <div class="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 p-3">
      <div class="flex items-center gap-2">
        <Sparkles class="size-5 text-indigo-500" />
        <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">AI 自动选题</h2>
        <UBadge v-if="lastGeneratedAt" color="gray" variant="subtle" class="ml-2">
          上次生成：{{ formatTime(lastGeneratedAt) }}
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="lastTrace || currentTask?.batchId"
          icon="i-lucide:eye"
          color="indigo"
          variant="soft"
          size="sm"
          @click="openLastTrace"
          >查看上次分析</UButton
        >
        <UButton
          icon="i-lucide:settings"
          color="gray"
          variant="soft"
          to="/dashboard/settings"
          >配置</UButton
        >
        <UButton
          :icon="generating ? 'i-lucide:loader-2' : 'i-lucide:sparkles'"
          :loading="generating"
          :disabled="generating"
          color="indigo"
          @click="startGenerate"
        >
          {{ generating ? '生成中...' : '立即生成选题' }}
        </UButton>
      </div>
    </div>

    <!-- 进度条 -->
    <div
      v-if="currentTask && generating"
      class="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 px-3 py-2 bg-indigo-50 dark:bg-slate-800/50"
    >
      <Loader2 class="size-4 text-indigo-500 animate-spin" />
      <div class="flex-1 min-w-0">
        <div class="text-sm text-slate-700 dark:text-slate-200 truncate">
          {{ currentTask.message }}
        </div>
        <div class="text-xs text-slate-500">
          阶段：{{ phaseLabel[currentTask.phase] }}
          <template v-if="currentTask.totalArticles > 0"> · 已加载 {{ currentTask.totalArticles }} 篇文章</template>
          · 已用时 {{ elapsed }} 秒
          <span v-if="currentTask.phase === 'calling_ai'" class="text-indigo-400">
            · AI 思考中，通常需要 30-60 秒
          </span>
        </div>
      </div>
      <UButton
        v-if="currentTask.trace"
        icon="i-lucide:eye"
        size="xs"
        color="indigo"
        variant="soft"
        @click="openLiveTrace"
        >查看分析过程</UButton
      >
    </div>

    <!-- 选题列表 -->
    <div class="flex-1 overflow-auto p-4">
      <!-- 列表操作栏（全选 + 批量删除），仅在有数据时显示 -->
      <div v-if="topics.length > 0" class="flex items-center gap-3 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <UCheckbox
          :model-value="allSelected"
          :indeterminate="someSelected"
          @update:model-value="toggleSelectAll"
        />
        <span class="text-sm text-slate-600 dark:text-slate-300">
          <template v-if="selectedIds.size > 0">已选 {{ selectedIds.size }} 条</template>
          <template v-else>全选当前页</template>
        </span>
        <UButton
          v-if="selectedIds.size > 0"
          icon="i-lucide:trash-2"
          color="rose"
          variant="soft"
          size="xs"
          :loading="deleting"
          @click="batchDelete"
          >删除选中</UButton
        >
        <UButton
          v-if="selectedIds.size > 0"
          color="gray"
          variant="ghost"
          size="xs"
          @click="clearSelection"
          >取消选择</UButton
        >
      </div>

      <!-- 空状态 -->
      <div
        v-if="!loading && topics.length === 0"
        class="flex flex-col items-center justify-center h-full text-center gap-3"
      >
        <Sparkles class="size-12 text-slate-300 dark:text-slate-600" />
        <div class="text-slate-500 dark:text-slate-400">
          还没有选题建议。请确保已
          <NuxtLink to="/dashboard/account" class="text-indigo-500 underline">同步公众号文章</NuxtLink>
          ，并在
          <NuxtLink to="/dashboard/settings" class="text-indigo-500 underline">设置</NuxtLink>
          里配置好 AI 模型，然后点击右上角「立即生成选题」。
        </div>
      </div>

      <!-- 按日期分组的卡片列表 -->
      <div v-else class="flex flex-col gap-6">
        <div v-for="group in topicGroups" :key="group.date">
          <!-- 日期标题 -->
          <div class="flex items-center gap-2 mb-3 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10">
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
            <span class="text-sm font-medium text-slate-500 dark:text-slate-400 px-2">
              {{ group.dateLabel }} · {{ group.items.length }} 个选题
            </span>
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>

          <!-- 该日期下的卡片网格 -->
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="topic in group.items"
          :key="topic.id"
          class="border rounded-lg p-4 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow flex flex-col gap-2"
          :class="topic.id != null && selectedIds.has(topic.id) ? 'border-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-900' : 'border-slate-200 dark:border-slate-700'"
        >
          <div class="flex items-start gap-2">
            <UCheckbox
              v-if="topic.id != null"
              :model-value="selectedIds.has(topic.id)"
              @update:model-value="toggleSelect(topic.id!)"
              class="mt-0.5"
            />
            <h3 class="font-semibold text-slate-800 dark:text-slate-100 flex-1 leading-snug">
              {{ topic.title }}
            </h3>
          </div>

          <p v-if="topic.angle" class="text-sm text-slate-600 dark:text-slate-300">
            <span class="text-slate-400">切入点：</span>{{ topic.angle }}
          </p>
          <p v-if="topic.summary" class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {{ topic.summary }}
          </p>

          <div v-if="parseKeywords(topic).length" class="flex flex-wrap gap-1 mt-1">
            <UBadge
              v-for="kw in parseKeywords(topic)"
              :key="kw"
              color="indigo"
              variant="subtle"
              class="text-xs"
              >{{ kw }}</UBadge
            >
          </div>

          <div v-if="parseReferences(topic).length" class="text-xs text-slate-400 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>参考：</span>
            <template v-for="(ref, i) in parseReferences(topic)" :key="i">
              <a
                v-if="ref.link"
                :href="ref.link"
                target="_blank"
                rel="noopener"
                class="text-indigo-500 hover:underline mr-1"
                >{{ ref.title || ref.source || ref.link }}</a
              >
              <span v-else-if="ref.title" class="mr-1">{{ ref.title }}</span>
            </template>
          </div>

          <div class="text-xs text-slate-400 mt-auto pt-2 flex items-center justify-between">
            <span>{{ formatTime(topic.created_at) }}</span>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide:eye"
                size="xs"
                color="gray"
                variant="ghost"
                :padded="false"
                title="查看本次分析过程"
                @click="openHistoryTrace(topic.batch_id)"
              />
              <UBadge v-if="topic.provider" color="gray" variant="subtle" class="text-xs font-mono">{{ topic.provider }}</UBadge>
            </div>
          </div>
        </div>
          </div>
          <!-- /该日期下的卡片网格 -->
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div
      v-if="total > 0"
      class="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
    >
      <div class="text-slate-500">
        共 {{ total }} 条 · 第 {{ currentPage }}/{{ totalPages || 1 }} 页
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide:chevron-left" size="xs" color="gray" variant="soft" :disabled="currentPage <= 1" @click="goPrev" />
        <UButton icon="i-lucide:chevron-right" size="xs" color="gray" variant="soft" :disabled="currentPage >= totalPages" @click="goNext" />
      </div>
    </div>

    <!-- 分析过程抽屉 -->
    <USlideover v-model="traceOpen" :ui="{ width: 'max-w-[680px]' }">
      <UCard class="h-full flex flex-col" :ui="{ body: { base: 'flex-1 overflow-auto' } }">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Eye class="size-5 text-indigo-500" />
              <h3 class="text-lg font-semibold">AI 分析过程</h3>
              <UBadge
                v-if="traceView?.source === 'live'"
                color="green"
                variant="subtle"
                size="xs"
                >实时</UBadge
              >
              <UBadge v-else color="gray" variant="subtle" size="xs">历史</UBadge>
            </div>
            <UButton icon="i-lucide:x" color="gray" variant="ghost" size="xs" @click="traceOpen = false" />
          </div>
        </template>

        <div v-if="traceLoading" class="py-10 text-center text-gray-400">加载中...</div>

        <div v-else-if="traceView" class="flex flex-col gap-4">
          <!-- 元信息 -->
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span class="text-slate-400">服务商：</span>
              <span class="font-mono">{{ traceView.provider || '-' }}</span>
            </div>
            <div>
              <span class="text-slate-400">模型：</span>
              <span class="font-mono">{{ traceView.model || '-' }}</span>
            </div>
            <div>
              <span class="text-slate-400">状态：</span>
              <UBadge
                :color="traceView.status === 'success' ? 'green' : traceView.status === 'failed' ? 'rose' : 'orange'"
                variant="subtle"
                size="xs"
                >{{ traceView.status || '-' }}</UBadge
              >
            </div>
            <div>
              <span class="text-slate-400">耗时：</span>
              <span>{{ traceView.durationMs ? (traceView.durationMs / 1000).toFixed(1) + 's' : '-' }}</span>
            </div>
            <div>
              <span class="text-slate-400">尝试次数：</span>
              <span>{{ traceView.attempts ?? '-' }}</span>
            </div>
            <div>
              <span class="text-slate-400">输入文章：</span>
              <span>{{ traceView.inputArticleCount ?? '-' }} 篇</span>
            </div>
            <div>
              <span class="text-slate-400">生成选题：</span>
              <span>{{ traceView.suggestionCount ?? '-' }} 个</span>
            </div>
            <div>
              <span class="text-slate-400">Token：</span>
              <span>
                {{ traceView.promptTokens ?? '-' }} / {{ traceView.completionTokens ?? '-' }}
                <span class="text-xs text-slate-400">(输入/输出)</span>
              </span>
            </div>
          </div>

          <div v-if="traceView.error" class="text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded p-2">
            ⚠ {{ traceView.error }}
          </div>

          <!-- 切换：Prompt / 原始返回 -->
          <div class="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div class="flex items-center gap-2 mb-2">
              <UButton size="xs" :color="traceTab === 'prompt' ? 'indigo' : 'gray'" :variant="traceTab === 'prompt' ? 'solid' : 'soft'" @click="traceTab = 'prompt'">Prompt 输入</UButton>
              <UButton size="xs" :color="traceTab === 'response' ? 'indigo' : 'gray'" :variant="traceTab === 'response' ? 'solid' : 'soft'" @click="traceTab = 'response'">AI 原始返回</UButton>
            </div>

            <div v-if="traceTab === 'prompt'">
              <div class="text-xs text-slate-400 mb-1">System Prompt</div>
              <pre class="text-xs bg-slate-50 dark:bg-slate-800 rounded p-3 overflow-auto max-h-[200px] whitespace-pre-wrap break-words font-mono">{{ traceView.systemPrompt || '(空)' }}</pre>
              <div class="text-xs text-slate-400 mb-1 mt-3">User Message（输入素材）</div>
              <pre class="text-xs bg-slate-50 dark:bg-slate-800 rounded p-3 overflow-auto max-h-[300px] whitespace-pre-wrap break-words font-mono">{{ traceView.userMessage || '(空)' }}</pre>
            </div>

            <div v-else>
              <pre class="text-xs bg-slate-50 dark:bg-slate-800 rounded p-3 overflow-auto max-h-[500px] whitespace-pre-wrap break-words font-mono">{{ traceView.rawResponse || '(空)' }}</pre>
            </div>
          </div>
        </div>
      </UCard>
    </USlideover>
  </div>
</template>
