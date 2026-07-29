<script setup lang="ts">
/**
 * 设置卡片头部组件
 *
 * 统一封装设置卡片的「彩色渐变图标 + 标题 + 描述」头部布局，
 * 供所有设置卡片复用，保证视觉一致性（DRY）。
 *
 * 图标方块使用传入的主题色生成 135° 渐变背景，白色图标居中。
 */

/** 卡片头部属性 */
interface SettingCardHeaderProps {
  /** UIcon 图标名，如 i-lucide:globe */
  icon: string;
  /** 图标主题色（十六进制），用于生成渐变背景 */
  iconColor: string;
  /** 卡片标题 */
  title: string;
  /** 卡片描述（可选） */
  description?: string;
}

const props = defineProps<SettingCardHeaderProps>();

/**
 * 根据主题色生成 135° 渐变背景样式对象。
 * 纯函数：仅依赖入参，返回内联 style 对象。
 */
const iconBgStyle = computed(() => ({
  background: `linear-gradient(135deg, ${props.iconColor} 0%, ${props.iconColor}cc 100%)`,
}));
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- 彩色渐变图标方块 -->
    <div
      class="flex items-center justify-center size-10 rounded-xl shadow-sm shrink-0"
      :style="iconBgStyle"
    >
      <UIcon :name="icon" class="size-5 text-white" />
    </div>

    <!-- 标题与描述 -->
    <div class="flex flex-col min-w-0">
      <h3 class="text-base font-semibold leading-tight" style="color: var(--text)">
        {{ title }}
      </h3>
      <p
        v-if="description"
        class="text-xs leading-relaxed mt-0.5"
        style="color: var(--text-2)"
      >
        {{ description }}
      </p>
    </div>
  </div>
</template>
