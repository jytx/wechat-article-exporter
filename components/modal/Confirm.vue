<script setup lang="ts">
const props = defineProps({
  icon: {
    type: String,
    default: 'i-heroicons-solid:exclamation-triangle',
  },
  title: {
    type: String,
  },
  description: {
    type: String,
  },
  // 确认回调（由 useDialog 注入，open 时传入）
  onConfirm: {
    type: Function,
    default: undefined,
  },
  // 取消回调（由 useDialog 注入，open 时传入）
  onCancel: {
    type: Function,
    default: undefined,
  },
});

const modal = useDialog();
const emit = defineEmits(['confirm', 'cancel']);

// 点击确认：触发 useDialog 注入的回调（内含 resolve Promise + close）
async function onConfirmClick() {
  emit('confirm');
  if (props.onConfirm) {
    await props.onConfirm();
  } else {
    modal.close();
  }
}
// 点击取消：触发 useDialog 注入的回调（内含 resolve undefined + close）
function onCancelClick() {
  emit('cancel');
  if (props.onCancel) {
    props.onCancel();
  } else {
    modal.close();
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-2 font-medium text-lg p-5">
      <UIcon :name="icon" class="size-10 text-rose-500" />
      <span>{{ title }}</span>
    </div>
    <div v-if="description" class="px-5 pb-5">{{ description }}</div>

    <div class="flex justify-end space-x-3 px-5 py-3 border-t border-gray-100">
      <UButton color="white" class="px-3" @click="onCancelClick">取消</UButton>
      <UButton color="rose" class="px-3" @click="onConfirmClick">确定</UButton>
    </div>
  </div>
</template>
