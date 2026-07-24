<template>
  <div class="p-2 mx-auto container">
    <p class="flex justify-between">
      <span>频道地址: </span>
      <ElTag>有效地址: {{ validURLs.length }}</ElTag>
    </p>
    <ElInput type="textarea" class="my-2" v-model="url" placeholder="请输入youtube频道地址,每行一个" autosize />
    <ElButton class="px-5" @click="submit" :loading="btnLoading" :disabled="validURLs.length === 0">{{
      btnLoading ? '提取中' : '提取'
    }}</ElButton>

    <p class="mt-10 flex justify-between">
      <span>提取结果:</span>
      <ElTag>有效频道ID: {{ channelIDs.length }}</ElTag>
    </p>
    <ElInput type="textarea" class="pb-5 my-2" v-model="channelID" placeholder="频道id提取结果" readonly autosize />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const url = ref('');
const channelID = ref('');
const btnLoading = ref(false);

const validURLs = computed(() => {
  return url.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('https://www.youtube.com/'));
});
const channelIDs = computed(() => {
  return channelID.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line);
});

async function submit() {
  channelID.value = '';
  btnLoading.value = true;

  for (const url of validURLs.value) {
    const channelId = await extractChannelID(url);
    if (channelId) {
      channelID.value += channelId + '\n';
    }
  }
  btnLoading.value = false;
}

async function extractChannelID(url: string): Promise<string | null> {
  const html = await fetch('https://lingering-haze-9880.sonaliyadav.workers.dev/?url=' + url).then(res => res.text());
  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');
  const meta = document.querySelector('meta[property="og:url"]');
  if (!meta) {
    return null;
  }
  const content = meta.getAttribute('content');
  if (!content) {
    return null;
  }
  return content.replace(/^https:\/\/www\.youtube\.com\/channel\//, '');
}
</script>
