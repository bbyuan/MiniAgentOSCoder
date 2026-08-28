# 设计

## 执行模型

`POST /runs/{run_id}/start` 将任务交给独立 Run Worker 线程后立即返回。Agent Loop 的步骤、Observation 和预算保留在线程栈中。普通工具同步执行；`apply_patch` 在 Tool Gateway 完成 schema、effect、budget 和 dry-run 检查后进入审批协调器。

审批协调器创建 `ApprovalRequest`、保存审批前 Checkpoint、写入 `approval.requested` Trace，并将 Run 转为 `waiting_approval`。等待使用可取消 Event，不占用 HTTP 请求。批准接口设置决策后，执行线程创建文件快照、转为 `applying_patch`、执行已经预检过的补丁，然后进入 `testing` 并继续原 Agent Loop。拒绝会生成失败 Observation，Run 转为 `repairing` 后继续规划。

## Tool Gateway

工具注册支持可选 preflight handler。审批工具先运行 preflight；失败时直接返回受控 ToolResult，不创建审批。成功时将预检元数据交给审批处理器。只有一次性批准后才调用真实 handler，避免预检阶段发生写入。

`apply_patch` 接收 `patch` 字符串，descriptor 为 `fs.write`、high risk、approval required。Patch Pipeline 负责：

- 解析并限制工作区内目标文件。
- 使用 `git apply --check --no-index` 验证补丁可应用。
- 在 `runs/{run_id}/snapshots/{checkpoint_id}` 保存原文件。
- 应用补丁并返回文件数、增删行与快照标识。

## API 与状态

- `GET /runs/{run_id}/approval` 返回 `{ approval: ApprovalRequest | null }`。
- `POST /approve` 当前只执行 `approve_once`；未知模式返回 422。
- `POST /deny` 将拒绝原因交给等待中的动作。
- `GET /runs/{run_id}` 在等待时返回 `waiting_on=approval_id`。
- SSE 在 `waiting_approval` 期间保持连接，批准或拒绝后继续追加事件。

## 工作台

Workbench 从 `approval.requested` 事件读取审批数据，并可通过查询接口恢复刷新后的待审批状态。Overview 中展示目标文件、增删统计、风险、原因和可滚动 diff；按钮只提供明确可实现的“批准一次”和“拒绝”。决策提交期间禁用重复操作。

## 安全与失败

- API Key、环境变量值和敏感文件内容不进入审批 payload。
- patch 目标必须经过工作区路径守卫，绝对路径和 `..` 被拒绝。
- dry-run 失败不产生审批。
- 等待审批时取消 Run 会唤醒执行线程并以 cancelled 结束。
- 快照发生在批准之后、实际写入之前；快照失败则不应用补丁。
