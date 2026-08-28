# 设计

## 目标

- 让工作台首先像一个安静、可信、可长时间使用的开发工具。
- 在首屏同时看见任务、运行状态、活动轨迹和关键控制面信息。
- 中英文和深浅主题切换即时生效、刷新后保持。
- 桌面、窄屏和移动端均无重叠、截断或无意义空白。

## 信息架构

### 顶部栏

左侧保留产品与当前项目，右侧放置模型状态、运行状态、语言分段控件和主题图标。删除无实际行为的 Settings 按钮。

### 运行画布

顶部是紧凑 Run header；其下为预算指标；主体是 Activity 时间线而非营销式空 Hero；底部任务输入器承载 workspace、任务、模式和运行/停止动作。

### Inspector

Inspector 使用 Overview、Context、Trace 三个标签页。Overview 包含 Plan、Contract、Diff、Tests 和 Approval；Context 专注上下文选择及 Token；Trace 展示完整运行事件。页面区段使用分隔线和背景层级，不堆叠卡片。

## 国际化

前端提供类型化扁平词典和 `PreferencesProvider`。`usePreferences()` 暴露 `locale`、`theme`、`t` 及切换函数。已知运行状态、计划步骤、原因和默认数据通过映射翻译；用户内容、路径、命令和模型输出保持原文。

## 主题

使用 CSS 语义变量描述 canvas、surface、text、muted、border、accent、success、warning 和 danger。主题值写入 `data-theme`，首次访问优先使用已保存值，其次使用系统偏好。深色模式使用中性炭黑而非蓝灰单色，状态色保持可辨识。

## 交互与可访问性

- 语言使用分段控件，主题使用 Sun/Moon 图标按钮。
- 所有图标按钮提供 aria-label 和 title。
- 使用 `:focus-visible` 明确键盘焦点。
- 活动状态动画遵守 `prefers-reduced-motion`。
- Inspector 标签使用 `role=tablist/tab/tabpanel`。

## 风险与权衡

- 本地词典适合当前 P0 规模；后续文案增多时可迁移到专门 i18n 库而不改变组件调用方式。
- 不翻译后端自由文本可避免错误翻译代码、命令和模型输出，但会出现少量双语混排。
- 浏览器自动化环境若不可用，仍执行 TypeScript 构建和静态响应式审查，并记录视觉验证缺口。
