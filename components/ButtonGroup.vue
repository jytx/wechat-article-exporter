<template>
  <ElDropdown placement="bottom-start" @command="(cmd: string) => emit(cmd)">
    <slot>
      <ElButton label="导出" />
    </slot>
    <template #dropdown>
      <ElDropdownMenu>
        <ElDropdownItem
          v-for="item in props.items"
          :key="item.event"
          :command="item.event"
          :disabled="item.disabled"
        >
          {{ item.label }}
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<script setup lang="ts">
const emit = defineEmits();

interface Item {
  label: string;
  event: string;
  disabled?: boolean;
}
interface Props {
  items: Item[];
}

const props = defineProps<Props>();
</script>
