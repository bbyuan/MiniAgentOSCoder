# Desktop Workbench 增量规格

## ADDED Requirements

### DW-007 实时 Run 执行

工作台 SHALL 通过 Daemon 启动已准备的 Run，并通过 SSE 增量更新运行状态和 Trace。

#### Scenario: 从工作台执行任务

- GIVEN 用户已打开项目、模型配置有效并提交任务
- WHEN Daemon 创建并启动 Run
- THEN 工作台 SHALL 显示 `running`
- AND SHALL 在模型、Action、工具和终态事件到达时更新 Trace

#### Scenario: 模型配置未完成

- GIVEN `/models/status` 返回 `configured=false`
- WHEN 用户提交任务
- THEN 工作台 SHALL 保留已准备的 Run
- AND SHALL 清楚提示需要完成模型配置而不尝试启动 Worker
