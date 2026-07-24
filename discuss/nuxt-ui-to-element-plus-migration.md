# Nuxt UI → Element Plus 迁移方案

> 本文档记录将主组件库从 Nuxt UI v2 迁移到 Element Plus 的完整方案，含组件映射表、调用点清单和分批执行策略。

## 一、背景

项目 `wechat-article-exporter` 当前使用 `@nuxt/ui ^2.17.0` 作为主组件库。经评估，决定替换为 Element Plus。影响范围：**44 个 `.vue` 文件，约 240 处组件标签**，并包含命令式弹窗（`useModal`）的架构级重构。

## 二、技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 接入方式 | `@element-plus/nuxt@1.1.5` + `element-plus@2.14.3` | 官方 Nuxt 模块，支持组件和样式按需自动导入 |
| Tailwind | **保留**（手动补全 `tailwind.config.js` 的 `content`） | 项目大量 Tailwind class，与 EP 共存风险最低 |
| 图标系统 | **保留 `@nuxt/icon`（独立安装）** | 它是独立包，`<UIcon>` 30 处调用无需改动 |
| 命令式弹窗 | **自封装 `useDialog()`** | 保留现有 `modal.open(Comp, props)` 调用习惯 |
| 命令式消息 | 重写 `composables/toast.ts` → 底层改用 `ElNotification` | 对外保持 `success/info/warning/error` 签名不变 |

## 三、组件映射表

### color（颜色）映射规则

| Nuxt UI color | Element Plus type | 说明 |
|---------------|-------------------|------|
| `primary` / `blue` | `primary` | 主色 |
| `green` | `success` | 成功 |
| `rose` | `danger` | 危险/删除 |
| `amber` / `orange` | `warning` | 警告 |
| `gray` / `white` / `black` | `default`（不传 type） | 中性 |
| `fuchsia` / `indigo` / `sky` | 自定义 CSS 或就近映射 | EP 无对应，需单独处理 |

### variant（样式变体）映射规则

| Nuxt UI variant | Element Plus | 说明 |
|-----------------|--------------|------|
| `solid`（默认） | 默认（filled） | 实心 |
| `soft` | `plain` | 浅色平面 |
| `ghost` | `text` | 文字按钮 |
| `link` | `link` | 链接 |
| `outline` | `plain` + 边框 | 描边 |

### size 映射规则

| Nuxt UI size | Element Plus size |
|--------------|-------------------|
| `xl` | `large` |
| `md`（默认） | `default` |
| `sm` / `xs` | `small` |

### 组件对照表

| Nuxt UI | Element Plus | 数量 | 关键差异/处理 |
|---------|-------------|------|--------------|
| `UButton` | `ElButton` | 80 | `icon`(字符串)→移除改用 `#icon` slot 配 `<UIcon>`；`square`→`circle`；`block`→`class="w-full"` |
| `UIcon` | **保留 `<UIcon>`**（@nuxt/icon 独立） | 30 | 无需改动 |
| `UInput` | `ElInput` / `ElInputNumber` | 28 | `icon`→`#prefix` slot；`#trailing`→`#suffix`；`type=number` 部分→`ElInputNumber` |
| `UCheckbox` | `ElCheckbox` | 19 | `label`(prop文本)→默认 slot 文本 |
| `UCard` | `ElCard` | 13 | `#header`/`#footer` 对应；`:ui` 深度定制(2处)→CSS |
| `UPopover` | `ElPopover` | 12 | `mode=hover`→`trigger="hover"`；`:popper.placement`→`placement`；`#panel`→默认内容 |
| `UTooltip` | `ElTooltip` | 11 | `text`→`content`；`:popper`→`placement` |
| `USelectMenu` | `ElSelect`+`ElOption` | 9 | **最复杂**：对象型 v-model 需改造；`searchable`→`filterable`；`#option`→slot |
| `UBadge` | `ElTag` | 7 | `color`→`type`；`variant=subtle`→`effect="light"` |
| `USlideover` | `ElDrawer` | 5 | `side=left`→`direction="ltr"`；`:ui.width`→`size` prop |
| `UModal` | `ElDialog` | 5 | `prevent-close`→`:close-on-click-modal="false"`等 |
| `UAvatar` | `ElAvatar` | 4 | `size=2xs`→数字/small |
| `UTextarea` | `ElInput type="textarea"` | 2 | `autoresize`→`autosize` |
| `UAlert` | `ElAlert` | 2 | `:actions`→`#default` 内自加按钮 |
| `UProgress` | `ElProgress` | 2 | `:value/:max`→`:percentage`(自己算) |
| `UTabs` | `ElTabs`+`ElTabPane` | 1 | 数据驱动→显式声明 |
| `UFormGroup`+`UForm` | `ElFormItem`+`ElForm` | 1 | `:validate`→`:rules`+ref validate |
| `UDropdown` | `ElDropdown` | 1 | `:items`→`ElDropdownMenu` 显式 |
| `UToggle` | `ElSwitch` | 1 | `on/off-icon`→slot |
| `UMeter` | `ElProgress`+自定义 | 1 | `#indicator`→`#default` |

## 四、命令式弹窗重构（useModal → useDialog）

### 现状

项目用 Nuxt UI 的 `useModal()` 驱动 3 个核心弹窗（Login / Confirm / QQGroup），特点：
- `modal.open(component, props)` 返回 `void`（非 Promise）
- `useModal` 是 `createSharedComposable` 单例，同时只能开一个 modal
- 结果传递靠全局状态副作用或 props 回调

### 重构方案

自封装 `composables/useDialog.ts`，保持命令式 API：
- `open(component, props)` → 渲染组件到全局 `AppDialogHost`
- `close()` → 关闭当前弹窗
- `isOpen` → 响应式开关状态
- 升级：`open()` 返回 Promise，通过约定 `onConfirm`/`onCancel` props 回调 resolve

### 受影响调用点（10 处）

| 文件 | 用途 |
|------|------|
| `components/dashboard/Actions.vue` | 打开 QQ 群弹窗 |
| `components/dashboard/SessionExpiredBanner.vue` | session 过期重扫码 |
| `components/dashboard/BottomPanel.vue` | 底栏登录 |
| `components/global/SearchAccountDialog.vue` | 搜索时 session 过期 |
| `components/global/CredentialsDialog.vue` | 添加公众号时 session 过期 |
| `pages/login.vue`（2处） | 登录页加载即弹 + 按钮触发 |
| `pages/dashboard/account.vue`（3处） | 同步失败/后台任务失败/删除确认 |
| `components/modal/Login.vue` | 内部 close + isOpen 轮询 |
| `components/modal/Confirm.vue` | 内部 close（修正 onConfirm 回调 bug） |
| `components/modal/QQGroup.vue` | 内部 close |

## 五、分批执行策略

| 批次 | 内容 | 文件数 | 风险 |
|------|------|--------|------|
| **P0** | 基础设施改造（依赖/配置/useDialog/toast/app.vue/DialogHost） | ~6 | 高 |
| **P1** | 基础原子组件（Button/Input/Checkbox/Textarea/Badge/Avatar） | ~25 | 低 |
| **P2** | 反馈类组件（Tooltip/Popover/Alert/Progress/Switch） | ~12 | 中 |
| **P3** | 复杂组件（SelectMenu/Tabs/Dropdown/Form/Meter） | ~8 | 高 |
| **P4** | Overlay（Modal/Slideover）+ `:ui` 深度定制翻译 | ~10 | 高 |
| **P5** | Modal 架构重构（3组件 + 10调用点）+ 回归测试 | ~13 | 高 |

每批用 `scripts/start-dev.sh` 验证编译通过、页面可渲染后，再进入下一批。每批独立 commit。

## 六、风险与注意事项

1. **Tailwind `content` 必须先补全**（P0），否则移除 `@nuxt/ui` 后全站 class 失效
2. **图标 prop 是批量替换难点**：UButton/UInput 的 `icon="i-xxx"` 字符串 prop，EP 不支持，需全部改为 slot 包 `<UIcon>`
3. **USelectMenu 对象型 v-model**（9处）需逐个确认改造方案
4. **`:ui` 深度定制**（12处）需手工翻译为 CSS，无统一规则
5. **color 映射不全**：fuchsia/indigo/sky/amber 等需自定义 CSS 变量或就近映射
