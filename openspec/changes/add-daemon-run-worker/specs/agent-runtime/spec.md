# Agent Runtime 增量规格

## ADDED Requirements

### AR-010 Daemon Run Worker

Daemon SHALL 通过后台 Worker 执行已准备的 Run，并将 AgentRunLoop 的状态、预算、observation 和最终结果同步到 Run API。

#### Scenario: 启动准备完成的 Run

- GIVEN Run 处于 `planning` 且模型配置有效
- WHEN 客户端请求启动 Run
- THEN Daemon SHALL 将 Run 转为 `running`
- AND Worker SHALL 使用该 Run 的 Contract、Context Pack、Provider 和 Tool Gateway 执行 AgentRunLoop

#### Scenario: 拒绝重复启动

- GIVEN Run 已在运行或已经终止
- WHEN 客户端再次请求启动
- THEN Daemon SHALL 返回冲突
- AND SHALL NOT 创建第二个 Worker 执行同一 Run

#### Scenario: 协作式取消

- GIVEN Run 正在执行
- WHEN 用户请求取消
- THEN Worker SHALL 设置该 Run 的取消信号
- AND AgentRunLoop SHALL 在下一个安全边界停止且不开始新的工具副作用

### AR-011 实时 Trace 事件流

Daemon SHALL 提供按 Trace 顺序输出的 SSE 事件流，并在 Run 终止且事件发送完成后关闭。

#### Scenario: 订阅运行事件

- GIVEN Run 已产生 Trace 事件
- WHEN 客户端订阅 `/runs/{run_id}/events/stream`
- THEN Daemon SHALL 从请求游标之后发送事件
- AND 每条数据 SHALL 包含完整 TraceEvent

