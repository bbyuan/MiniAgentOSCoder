# 增加 Daemon Run Worker 与实时事件流

## 背景

Daemon 已能创建 Run、编译 AgentContract 和 Context Pack，自主 Agent Loop 也能调用真实模型，但两者尚未连接。当前工作台提交任务后停留在 `planning`，无法真正执行模型动作，也无法持续获得运行事件。

## 变更内容

- 新增本地 Run Worker，将已创建 Run 交给 AgentRunLoop 后台执行。
- 新增 `POST /runs/{run_id}/start`，在执行前校验 Run 状态和模型配置。
- 将 Worker 终态、预算、最新 observation 和最终消息同步回 Run 查询接口。
- 为 AgentRunLoop 增加步骤边界的协作式取消。
- 保留事件快照 API，并新增 `GET /runs/{run_id}/events/stream` SSE 实时事件流。
- 工作台启动真实 Run，并用 SSE 更新状态和 Trace 面板。

## 能力影响

- `agent-runtime`：新增后台运行调度、状态同步和协作式取消。
- `desktop-workbench`：新增真实执行与实时事件消费。

## 不在本阶段

- 跨进程持久化队列和 Daemon 重启恢复。
- 同一 Run 的并行 Agent 分支。
- 强制中断正在进行的模型 HTTP 请求或系统命令。
- Patch 审批后的暂停与恢复。

