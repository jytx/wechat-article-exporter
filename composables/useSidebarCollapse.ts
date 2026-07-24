/**
 * 侧边栏收起/展开状态管理
 * 用 useLocalStorage 持久化，刷新后保持上次的状态
 */
export const useSidebarCollapse = () => {
  // true = 收起（只显示图标），false = 展开（完整宽度）
  const collapsed = useLocalStorage<boolean>('sidebar-collapsed', false);

  function toggle(): void {
    collapsed.value = !collapsed.value;
  }

  return { collapsed, toggle };
};
