# Desktop Workbench 增量规格

## ADDED Requirements

### DW-008 双语工作台

工作台 SHALL 支持中文和英文界面，并在本地持久化用户选择。

#### Scenario: 切换为中文

- GIVEN 用户正在查看英文工作台
- WHEN 用户选择中文
- THEN 核心导航、控件、状态、计划和运行面板 SHALL 立即显示中文
- AND 刷新页面后 SHALL 保持中文

### DW-009 深浅主题

工作台 SHALL 支持浅色和深色主题，并确保两种主题下的信息层级、对比度和状态颜色可辨识。

#### Scenario: 切换深色主题

- GIVEN 用户正在使用浅色主题
- WHEN 用户点击主题按钮
- THEN 页面 SHALL 立即应用深色语义变量
- AND 刷新页面后 SHALL 保持深色主题

### DW-010 运行画布与 Inspector

工作台 SHALL 使用运行画布呈现任务与实时 Activity，并使用标签式 Inspector 组织 Overview、Context 和 Trace。

#### Scenario: 查看实时运行

- GIVEN Run 正在产生 SSE Trace 事件
- WHEN 事件到达工作台
- THEN Activity SHALL 按时间顺序显示最新事件
- AND Inspector Trace SHALL 保留完整事件列表

#### Scenario: 使用窄屏设备

- GIVEN 视口宽度不足以并排显示运行画布和 Inspector
- WHEN 工作台重新布局
- THEN 两个区域 SHALL 按顺序堆叠
- AND 文本、按钮、标签和输入区域 SHALL NOT 重叠或横向溢出
