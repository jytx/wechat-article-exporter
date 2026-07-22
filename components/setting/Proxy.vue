<template>
  <UCard>
    <template #header>
      <h3 class="text-2xl font-semibold">代理节点</h3>
      <p class="text-sm text-slate-10 font-serif">
        若此处留空，则网站将使用
        <ExternalLink :href="docsWebSite + '/get-started/proxy.html'" text="公共代理" /> 进行资源下载。
      </p>
      <p>
        <ExternalLink :href="docsWebSite + '/get-started/private-proxy.html'" text="如何搭建代理节点？" />
      </p>
    </template>

    <div class="flex space-x-10">
      <textarea
        class="h-[400px] flex-1 p-2 border rounded resize-none font-mono"
        v-model="textareaValue"
        spellcheck="false"
        placeholder="请填写私有部署的代理地址，一行一个"
      ></textarea>
      <div class="flex-1 flex-shrink-0">
        <div class="my-5">
          <p>代理节点地址要求：</p>
          <ol>
            <li>
              <p>1. 以 <code class="text-rose-500 font-mono">http/https</code> 开头的绝对路径地址。</p>
              <p>
                2. 该地址在使用时后面会自动拼接
                <code class="text-rose-500 font-mono">?url=</code> 等参数，请确保格式正确。
              </p>
            </li>
          </ol>
          <p class="mt-3">代理示例：</p>
          <p><code class="text-rose-500 font-mono">https://wproxy-01.deno.dev</code></p>
          <p><code class="text-rose-500 font-mono">https://wproxy-01.deno.dev/</code></p>
        </div>
        <div class="mt-5">
          <label class="block text-sm mb-1">代理认证密钥（可选）</label>
          <UInput v-model="authorizationValue" class="font-mono w-full" placeholder="若代理需要鉴权才填，如 deno deploy 的 token" />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import ExternalLink from '~/components/base/ExternalLink.vue';
import { docsWebSite } from '~/config';
import usePreferences, { waitForLoaded } from '~/composables/usePreferences';
import type { Preferences } from '~/types/preferences';
import toastFactory from '~/composables/toast';

const preferences: Ref<Preferences> = usePreferences() as unknown as Ref<Preferences>;
const toast = toastFactory();

const textareaValue = ref('');
const authorizationValue = ref('');
const saving = ref(false);

const proxyList = computed(() => {
  return textareaValue.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.startsWith('http'));
});

onMounted(async () => {
  await waitForLoaded();
  try {
    const configuredProxyList = (preferences.value as Preferences).privateProxyList;
    if (configuredProxyList.length > 0) {
      textareaValue.value = configuredProxyList.join('\n');
    }
    authorizationValue.value = (preferences.value as Preferences).privateProxyAuthorization || '';
  } catch (e) {}
});

const saveBtnText = ref('保存');
async function save() {
  if (saving.value) return;
  saving.value = true;
  saveBtnText.value = '保存中...';
  try {
    // 同步更新内存中的 preferences（触发 watch 自动保存）
    (preferences.value as Preferences).privateProxyList = proxyList.value;
    (preferences.value as Preferences).privateProxyAuthorization = authorizationValue.value;

    // 关键修复：显式立即 PUT，不再只依赖延迟的 watch（避免刷新丢失）
    const items = [
      { key: 'proxy_list', value: JSON.stringify(proxyList.value) },
      { key: 'proxy_authorization', value: authorizationValue.value },
    ];
    const res = await fetch('/api/web/data/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (data.success) {
      saveBtnText.value = '保存成功';
      toast.success('代理配置已保存', `共 ${proxyList.value.length} 个节点`);
    } else {
      throw new Error(data.error?.message || '保存失败');
    }
  } catch (e: any) {
    saveBtnText.value = '保存';
    toast.error('保存失败', e?.message);
  } finally {
    saving.value = false;
    setTimeout(() => {
      saveBtnText.value = '保存';
    }, 2000);
  }
}
</script>
