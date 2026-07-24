<script setup lang="ts">
import CodeSegment from '~/components/api/CodeSegment.vue';
import { apis } from '~/config/public-apis';

interface Props {
  initialSelected: string;
}
const props = defineProps<Props>();

const isOpen = ref(false);
const selectedApi = ref(apis[0]);

const payload: Ref<Record<string, any>> = ref({});

const host = window.location.protocol + '//' + window.location.host;

function onOpen() {
  isOpen.value = true;
  selectedApi.value = apis.find(api => api.name === props.initialSelected)!;
}

function apiChange() {
  payload.value = {};
}

const resp = ref<Record<string, any> | null | string>(null);
const hasResponse = computed(() => {
  return typeof resp.value === 'string' || (typeof resp.value === 'object' && resp.value);
});
const btnLoading = ref(false);
function submit() {
  const params = toRaw(payload.value);

  let url = selectedApi.value.url;
  if (selectedApi.value.method === 'GET') {
    url += '?' + new URLSearchParams(params).toString();
  }

  btnLoading.value = true;
  resp.value = null;
  fetch(url, {
    method: selectedApi.value.method,
  })
    .then(resp => {
      if (resp.headers.get('content-type') === 'application/json') {
        return resp.json();
      } else {
        return resp.text();
      }
    })
    .then(data => {
      resp.value = data;
    })
    .finally(() => {
      btnLoading.value = false;
    });
}
</script>

<template>
  <div>
    <ElTooltip content="在线调试" placement="top">
      <ElButton type="primary" text circle @click="onOpen"><template #icon><UIcon name="i-lucide:bug-play" /></template></ElButton>
    </ElTooltip>

    <ElDrawer v-model="isOpen" size="50%">
      <template #header>
        <h1 class="font-semibold text-2xl">在线接口调试工具</h1>
      </template>

      <div class="overflow-y-auto h-[calc(100vh-72px)] space-y-5 no-scrollbar">
          <div class="flex items-center gap-3">
            <span>选择接口: </span>
            <ElSelect
              class="flex-1"
              v-model="selectedApi"
              @change="apiChange"
            >
              <ElOption
                v-for="api in apis"
                :key="api.name"
                :label="api.name"
                :value="api"
              >
                <div>
                  <p class="font-medium">
                    <span
                      :class="[
                        api.method === 'GET' ? 'bg-green-400' : 'bg-fuchsia-400',
                        'inline-block size-2 mr-2 flex-shrink-0 rounded-full',
                      ]"
                      aria-hidden="true"
                    />
                    <span>{{ api.name }}</span>
                  </p>
                  <p class="text-gray-400 font-mono">{{ api.description }}</p>
                </div>
              </ElOption>
            </ElSelect>
          </div>

          <div class="space-y-5">
            <div>
              <p class="font-semibold mb-2">请求URL:</p>
              <p class="font-mono border p-2 rounded-md">
                <span class="text-gray-400">{{ host }}</span>
                <span class="font-semibold">{{ selectedApi.url }}</span>
              </p>
            </div>
            <div>
              <p class="font-semibold mb-2">请求方式:</p>
              <p class="font-mono border p-2 rounded-md">{{ selectedApi.method }}</p>
            </div>
            <div>
              <p class="font-semibold mb-2">参数:</p>
              <ElForm :model="payload" @submit.prevent="submit" class="space-y-3">
                <ElFormItem
                  v-for="p in selectedApi.params"
                  :key="p.name"
                  :label="p.name"
                  :prop="p.name"
                  :required="p.required"
                >
                  <ElInput
                    v-model="payload[p.name]"
                    :type="p.type === 'Int' ? 'number' : 'text'"
                    :placeholder="p.label + (p.remark ? '，' + p.remark : '')"
                  />
                </ElFormItem>
                <ElButton native-type="submit" class="px-5" :loading="btnLoading">提交</ElButton>
              </ElForm>
            </div>
          </div>
          <div v-if="hasResponse">
            <h3 class="font-bold text-2xl">响应</h3>
            <CodeSegment :code="resp!" :lang="typeof resp === 'object' ? 'json' : 'xml'" />
          </div>
        </div>
    </ElDrawer>
  </div>
</template>
