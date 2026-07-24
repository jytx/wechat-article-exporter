<!--
  全局弹窗容器 —— 等价 Nuxt UI 的 <UModals />
  挂载在 app.vue，消费 useDialog() 的响应式状态，渲染 ElDialog + 动态组件。
-->
<template>
  <ElDialog
    v-if="state.component"
    v-model="isOpen"
    :width="state.options.width ?? '520px'"
    :fullscreen="state.options.fullscreen ?? false"
    :close-on-click-modal="!state.options.preventClose"
    :close-on-press-escape="!state.options.preventClose"
    :show-close="!state.options.preventClose"
    :class="state.options.class"
    append-to-body
    @after-leave="reset"
  >
    <component :is="state.component" v-bind="state.props" />
  </ElDialog>
</template>

<script setup lang="ts">
// 消费全局单例的弹窗状态
const { state, isOpen, reset } = useDialog();
</script>
