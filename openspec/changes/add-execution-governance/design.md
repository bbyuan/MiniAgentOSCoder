# 设计

## 决策链

每次 `ToolGateway.call` 创建唯一 evaluation id，并按稳定顺序运行：

```text
effect -> budget -> schema -> path/command -> tool override
-> preflight -> approval -> sandbox boundary -> handler
```

每项产生 `GuardDecision`：guard、status、reason、rule、duration 和非敏感 metadata。失败项标记 `deny`，后续项不执行；无需运行的检查标记 `skipped`。最终 `PolicyEvaluation.outcome` 为 `allowed`、`denied` 或 `approval_denied`。

Gateway 在允许或拒绝时都调用审计回调。Run Worker 将完整评估写入 `policy.evaluated`，但不会复制文件内容、Patch 正文、命令输出或环境变量值。ToolResult 只携带 evaluation id 和 sandbox id。

## 有效工具策略

Descriptor 固有审批策略、AgentContract 策略和 Run override 共同决定有效策略。override 仅支持：

- `inherit`：使用原有策略。
- `approval_required`：将自动工具提高为人工审批。
- `deny`：禁止本 Run 调用该工具。

固有 `approval_required` 工具不能通过 override 降级为自动执行。治理配置只能在 Run 仍为 `planning` 且 Worker 未启动时修改。

## Sandbox Executor

`SandboxExecutor` 不使用 shell 字符串，接收 CommandGuard 解析后的 argv。所有进程固定在工作区 cwd，使用净化环境和 Run 私有 `.agent/sandboxes/{run_id}` HOME/TMP，创建独立进程组，超时后终止整个进程组，并限制返回到模型和 Trace 的 stdout/stderr 长度。

standard profile 保留运行测试所需的最小宿主环境；strict profile 进一步缩短超时/输出上限、使用更小的环境白名单，并拒绝明显的网络型命令参数。两者都通过 Capability Report 明确：当前 portable process backend 不提供内核级 syscall、网络命名空间或只读挂载保证。未来容器 backend 可实现相同接口。

每次子进程产生 `sandbox.started` 与 `sandbox.finished`，记录 sandbox id、profile、backend、argv 首项、timeout、return code、duration、是否截断和终止原因，不记录敏感环境或完整输出。

## Governance API

- `GET /runs/{run_id}/governance` 返回工具 Descriptor、Contract、当前治理配置、Sandbox Capability Report、PolicyEvaluation 和 SandboxExecution 历史。
- `PUT /runs/{run_id}/governance` 在启动前更新 profile 与工具 override。

历史来自权威 `trace.jsonl`，因此终态 Run、报告和 Replay 使用同一数据源。未知工具、未知策略、活动 Run 修改和降低固有安全等级均返回受控错误。

## Workbench

Governance 标签分为三段：

- Sandbox：profile 选择、当前 backend、已保证能力和限制。
- Tools：工具 effect、risk、固有审批策略和 Run override。
- Decisions：按 Action 展开最新评估，显示每个 Guard 的 allow/deny/skipped、理由和耗时。

编辑控件只在 planning 状态可用；活动或终态 Run 为只读。SSE 收到 `policy.evaluated` 或 `sandbox.*` 时刷新视图。

