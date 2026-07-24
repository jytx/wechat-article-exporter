<script setup lang="ts">
import qqGroupImg from '~/assets/qq-group.png';

const modal = useDialog();

function onClose() {
  modal.close();
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <h2 class="text-lg font-semibold">加入 QQ 群</h2>
      <ElButton circle link class="absolute right-3 top-3" @click="onClose">
        <UIcon name="i-lucide:x" class="size-6" />
      </ElButton>
    </div>

    <!-- 二维码图片展示区 -->
    <div class="flex flex-col justify-center items-center mx-auto p-5">
      <img :src="qqGroupImg" alt="" class="size-72" />
      <p class="text-2xl">群号: <span class="font-mono">991482155</span></p>
    </div>
  </div>
</template>
