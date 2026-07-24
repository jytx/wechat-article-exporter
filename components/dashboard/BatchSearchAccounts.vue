<template>
  <div>
    <ElButton type="primary" plain @click="open = true"
      ><template #icon><UIcon name="i-lucide:search" /></template>批量搜索</ElButton
    >

    <ElDialog v-model="open" width="640px">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">批量搜索公众号</h3>
          <ElButton text size="small" @click="open = false"><template #icon><UIcon name="i-lucide:x" /></template></ElButton>
        </div>
      </template>

      <div class="flex flex-col max-h-[85vh] gap-3">
          <p class="text-sm text-gray-500">
            输入公众号名称或微信号，一行一个。每个间隔约 1.5 秒防限流，搜到的会自动入库。
          </p>

          <!-- 输入区 -->
          <textarea
            v-model="keywordsText"
            :disabled="searching"
            rows="8"
            class="w-full p-2 border rounded resize-none font-mono text-sm dark:bg-slate-800 dark:border-slate-600"
            placeholder="量子位&#10;机器之心&#10;AI科技评论&#10;一行一个..."
          ></textarea>

          <div class="flex items-center justify-between">
            <ElCheckbox v-model="autoSave" :disabled="searching">自动入库</ElCheckbox>
            <div class="flex gap-2">
              <ElButton v-if="!searching" type="primary" @click="startSearch"
                ><template #icon><UIcon name="i-lucide:search" /></template>开始搜索</ElButton
              >
              <div v-else class="flex items-center gap-2 text-sm text-indigo-500">
                <Loader2 class="size-4 animate-spin" />
                <span>{{ task?.message || '搜索中...' }}</span>
              </div>
            </div>
          </div>

          <!-- 进度条 -->
          <div v-if="task && searching" class="space-y-1">
            <ElProgress :percentage="Math.round(task.done / (task.total || 1) * 100)" :show-text="false" :stroke-width="8" />
            <div class="text-xs text-gray-500 flex justify-between">
              <span>{{ task.done }}/{{ task.total }} · 找到 {{ task.found }} · 入库 {{ task.saved }}</span>
            </div>
          </div>

          <!-- 结果列表 -->
          <div v-if="task?.results?.length" class="border rounded max-h-[280px] overflow-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th class="text-left p-2 font-medium">关键词</th>
                  <th class="text-left p-2 font-medium">公众号</th>
                  <th class="text-left p-2 font-medium">微信号</th>
                  <th class="text-center p-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(r, i) in task.results"
                  :key="i"
                  class="border-t border-gray-100 dark:border-slate-700"
                >
                  <td class="p-2 text-gray-500">{{ r.keyword }}</td>
                  <td class="p-2">
                    <span v-if="r.found" :class="r.matched ? '' : 'text-amber-500'">{{ r.nickname }}</span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="p-2 text-gray-500 font-mono text-xs">{{ r.alias || '-' }}</td>
                  <td class="p-2 text-center">
                    <ElTag v-if="r.found && r.matched" type="success" effect="light" size="small">精确</ElTag>
                    <ElTag v-else-if="r.found" type="warning" effect="light" size="small">疑似</ElTag>
                    <ElTag v-else type="info" effect="light" size="small">未找到</ElTag>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 完成提示 -->
          <div v-if="task && !searching && (task.status === 'completed' || task.status === 'failed')" class="text-sm">
            <span v-if="task.status === 'completed'" class="text-green-600">
              ✅ {{ task.message }}
            </span>
            <span v-else class="text-rose-500">❌ {{ task.message }}</span>
          </div>
        </div>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import toastFactory from '~/composables/toast';

const toast = toastFactory();
const emit = defineEmits<{ (e: 'completed'): void }>();

const open = ref(false);
const keywordsText = ref('');
const autoSave = ref(true);
const searching = ref(false);
const task = ref<any>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function startSearch() {
  const keywords = keywordsText.value
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (keywords.length === 0) {
    toast.warning('请输入关键词', '一行一个公众号名称或微信号');
    return;
  }

  searching.value = true;
  task.value = { done: 0, total: keywords.length, found: 0, saved: 0, results: [], status: 'running', message: '开始搜索...' };

  try {
    const res = await $fetch<{ success: boolean; data: { taskId: string | null; error?: string }; message?: string }>(
      '/api/web/data/v1/batch/search-accounts',
      {
        method: 'POST',
        body: { keywords, autoSave: autoSave.value },
        credentials: 'include',
      }
    );

    if (!res.success || !res.data.taskId) {
      searching.value = false;
      toast.error('启动失败', res.data.error || res.message || '未登录或登录已过期');
      return;
    }

    toast.info('开始批量搜索', `共 ${keywords.length} 个关键词，请勿关闭页面`);
    startPolling(res.data.taskId);
  } catch (e: any) {
    searching.value = false;
    const msg = e?.data?.message || e?.message || '请求失败';
    toast.error('启动失败', msg);
  }
}

function startPolling(taskId: string) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await $fetch<{ success: boolean; data: any }>(
        `/api/web/data/v1/batch/search-accounts-status?taskId=${taskId}`,
        { credentials: 'include' }
      );
      if (!res.success || !res.data) return;
      task.value = res.data;

      if (res.data.status === 'completed' || res.data.status === 'failed') {
        stopPolling();
        searching.value = false;
        if (res.data.status === 'completed') {
          toast.success('搜索完成', res.data.message);
          emit('completed'); // 通知父组件刷新公众号列表
        } else {
          toast.error('搜索失败', res.data.message);
        }
      }
    } catch (e) {
      console.warn('轮询搜索状态失败:', e);
    }
  }, 1500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onBeforeUnmount(stopPolling);
</script>
