# 设计

## 多轮修复

`run_test` 返回失败后，Run Worker 将状态转为 `repairing`，递增 `repair_attempts`，并写入 `repair.started`。完整测试输出继续作为 Action Observation 传给同一 `AgentRunLoop`，Planner 被明确要求先分析失败，再生成最小补丁，并在完成前重新运行测试。后续 `apply_patch` 沿用现有 Tool Gateway，必须再次预检和审批；测试通过时写入 `repair.completed`。

修复不引入第二个编排器，也不创建脱离主 Run 的子任务。重试上限由 AgentContract 的 `max_steps`、`max_model_calls`、`max_tool_calls` 和墙钟预算共同执行，`repair_attempts` 负责解释运行历史，不替代统一预算守卫。

## 恢复点

每次批准补丁后、实际写入前创建 `before-apply-*` Checkpoint 和同名 Snapshot。恢复点 API 将检查点与 `snapshots/{checkpoint_id}/manifest.json` 关联，返回：

- 检查点标识、创建阶段、步骤和 Trace 偏移；
- 受影响文件；
- 是否存在完整快照、是否允许当前回滚；
- 当前 Run 的修复轮次。

仅带快照的 `before-apply-*` 检查点可回滚。回滚读取 manifest：原来存在的文件从快照复制回工作区，原来不存在的文件在路径守卫检查后移除。manifest 中的每个路径都重新校验，不能依赖磁盘上的快照内容天然可信。

## API 与并发

- `GET /runs/{run_id}/checkpoints` 返回按保存顺序排列的恢复点。
- `POST /runs/{run_id}/rollback` 接收 `checkpoint_id`。
- Run Worker 仍处于 active 时返回 409，防止回滚与 Agent 工具写入竞争。
- 未知检查点、缺失快照或清单损坏返回受控错误，不修改工作区。
- 成功后保留 Run 的终态，仅更新变更摘要为 `Rolled back`，并追加恢复 Trace；历史执行结果不被篡改。

## Workbench

Inspector 增加 Recovery 标签。每个恢复点显示阶段、步骤、目标文件和快照状态。可回滚项提供恢复图标按钮；第一次点击进入内联确认，第二次确认才调用 API。执行中禁用恢复，成功后重新读取恢复点、Artifacts 和 Trace。

## 安全边界

- 回滚只能写入当前 Project 的工作区。
- `.agent`、`.git`、`runs`、`.env*` 和工作区外路径继续受保护。
- 回滚不会运行 shell 命令，也不会重置 Git 仓库。
- 测试失败不会自动修改或丢弃用户已经批准的补丁。
