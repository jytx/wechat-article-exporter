<template>
  <div class="flex flex-col h-full">
    <div class="flex-1 p-6 overflow-scroll space-y-20">
      <ApiSummary />
      <ApiDocument v-for="(api, idx) in apis" :key="idx" v-bind="api" :index="idx + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';
import { apis } from '~/config/public-apis';

useHead({
  title: `API | ${websiteName}`,
});
</script>
