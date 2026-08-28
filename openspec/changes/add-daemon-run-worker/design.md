# 设计

## 上下文

Run 创建、模型 Provider、自主循环和 Trace 已各自存在。本阶段需要连接这些组件，同时保持“模型不能直接执行工具”和“桌面端/CLI 共享 Daemon API”两条边界。

## 目标

- 创建 Run 后可显式启动，避免配置错误时产生半执行状态。
- 执行不阻塞 HTTP 请求，状态可查询、事件可实时订阅。
- 取消、失败、预算耗尽和正常完成都有明确终态。
- 工作台不轮询完整 Trace 文件即可增量更新。

## 非目标

- 用 Redis、Celery 或云队列替换本地 Worker。
- 在本阶段实现分布式多租户调度。
- 绕过既有 Action IR、Guard 和 Tool Gateway。

## 关键决策

### 1. 两段式 Run API

`POST /runs` 负责准备 Run；`POST /runs/{id}/start` 负责校验 Provider、注册内置工具并调度执行。重复启动返回冲突，终态 Run 不能重新启动。后续恢复语义将使用独立 resume API。

### 2. FastAPI BackgroundTasks + RunWorker

API 使用 BackgroundTasks 在响应后调用类型化 `RunWorker`。Worker 负责状态迁移、Gateway 构造、AgentRunLoop 执行、结果回写和异常兜底。该实现适合本地单机 P0，也允许测试环境确定性执行；未来可在不改变 API 的前提下替换持久化队列。

### 3. 协作式取消

每个活跃 Run 有独立 cancellation event。AgentRunLoop 在模型调用前和模型返回后检查取消信号，保证取消后不会开始新的工具副作用。正在进行的同步网络或工具调用不会被强杀，完成后在下一安全边界进入 `cancelled`。

### 4. SSE 增量事件

`/events/stream` 从 `trace.jsonl` 按序号发送 `trace` 事件，支持 `after` 游标。Run 进入 completed、failed 或 cancelled 且已发送全部事件后关闭连接。原 `/events` 保持 JSON 快照，兼容回放和现有客户端。

### 5. 工作台连接生命周期

工作台在 Run 启动后建立一个 EventSource，逐条合并 Trace；收到终态事件后重新读取 Run 摘要并关闭连接。组件卸载或启动新 Run 时关闭旧 EventSource，防止重复订阅。

## 风险与权衡

- BackgroundTasks 不提供进程崩溃恢复，因此 Trace 是本阶段的审计记录而不是作业队列。
- JSONL 的并发读写依赖单行追加；SSE 读取使用短轮询并只发送完整 JSON 行。
- 协作式取消的延迟取决于当前模型/工具调用时长，UI 将其表达为 cancellation requested，而不是立即伪造终止。

