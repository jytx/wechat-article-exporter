/**
 * 命令式弹窗封装 —— 替代 Nuxt UI 的 useModal
 *
 * 设计说明：
 * - 单例模式（createSharedComposable），全应用共享同一个弹窗状态，同时只能打开一个弹窗。
 *   这与 Nuxt UI useModal 的行为一致，避免引入多实例栈的复杂性。
 * - open(component, props) 返回 Promise，被打开的组件可通过约定回调 resolve 结果：
 *     方式 A：组件在 props 中声明并调用 onConfirm / onCancel（推荐，Confirm.vue 即采用此模式）
 *     方式 B：调用方不关心返回值时可不 await（现有大部分调用点都是如此）
 * - AppDialogHost 组件挂载在 app.vue，消费此处的响应式状态来渲染 ElDialog + 动态组件。
 */
import { createSharedComposable } from '@vueuse/core';
import type { Component, Ref } from 'vue';
import { ref } from 'vue';

/** 弹窗扩展选项（对应 Nuxt UI Modal 类型的子集，透传给 ElDialog） */
export interface DialogOptions {
  /** 阻止点击遮罩 / ESC / 关闭按钮关闭弹窗（对应 UModal prevent-close） */
  preventClose?: boolean;
  /** 弹窗宽度，透传给 ElDialog 的 width 属性 */
  width?: string;
  /** 全屏（对应 UModal fullscreen） */
  fullscreen?: boolean;
  /** 自定义 class */
  class?: string;
}

/** 弹窗内部状态：要渲染的组件 + 传给它的 props + 弹窗容器选项 */
export interface DialogState {
  component: Component | null;
  props: Record<string, unknown>;
  options: DialogOptions;
}

/** useDialog 返回的命令式 API */
export interface UseDialogReturn {
  /** 当前弹窗状态（供 AppDialogHost 消费） */
  state: Ref<DialogState>;
  /** 弹窗是否打开 */
  isOpen: Ref<boolean>;
  /** 打开弹窗，渲染指定组件并传入 props，返回 Promise（可获取 onConfirm/onCancel 结果） */
  open: <T = unknown>(component: Component, props?: Record<string, unknown>, options?: DialogOptions) => Promise<T | undefined>;
  /** 关闭弹窗（不触发回调） */
  close: () => void;
  /** 重置状态（关闭动画结束后调用，清空组件引用） */
  reset: () => void;
  /** 更新当前弹窗的 props（对应 Nuxt UI patch） */
  patch: (props: Partial<Record<string, unknown>>) => void;
}

function _useDialog(): UseDialogReturn {
  const state = ref<DialogState>({
    component: null,
    props: {},
    options: {},
  });
  const isOpen = ref(false);

  // 保存当前 open 的 resolve，供组件回调触发
  let currentResolve: ((value: unknown) => void) | null = null;

  function open<T = unknown>(
    component: Component,
    props: Record<string, unknown> = {},
    options: DialogOptions = {},
  ): Promise<T | undefined> {
    // 默认 preventClose=true，与原项目 3 个 Modal 全部使用 prevent-close 的行为一致
    const mergedOptions: DialogOptions = { preventClose: true, ...options };
    // 包装 onConfirm / onCancel，让调用方可以通过 await 获取结果
    const wrappedProps: Record<string, unknown> = { ...props };

    const userOnConfirm = props.onConfirm as ((...args: unknown[]) => unknown) | undefined;
    const userOnCancel = props.onCancel as ((...args: unknown[]) => unknown) | undefined;

    wrappedProps.onConfirm = async (...args: unknown[]) => {
      const result = userOnConfirm ? await userOnConfirm(...args) : undefined;
      if (currentResolve) currentResolve(result);
      close();
    };
    wrappedProps.onCancel = (...args: unknown[]) => {
      if (userOnCancel) userOnCancel(...args);
      if (currentResolve) currentResolve(undefined);
      close();
    };

    state.value = { component, props: wrappedProps, options: mergedOptions };
    isOpen.value = true;

    return new Promise<T | undefined>((resolve) => {
      currentResolve = resolve as (value: unknown) => void;
    });
  }

  function close(): void {
    isOpen.value = false;
  }

  function reset(): void {
    state.value = { component: null, props: {}, options: {} };
    currentResolve = null;
  }

  function patch(props: Partial<Record<string, unknown>>): void {
    if (!state.value.component) return;
    state.value = {
      ...state.value,
      props: { ...state.value.props, ...props },
    };
  }

  return { state, isOpen, open, close, reset, patch };
}

/** 全局单例，所有调用方共享同一弹窗状态 */
export const useDialog = createSharedComposable(_useDialog);
