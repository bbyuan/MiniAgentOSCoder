# 增加 Checkpoint 断点续跑

## 变更内容

- Daemon 启动时继续将未终止 Run 标记为 `interrupted`，保留历史证据。
- 增加恢复 API，从 SQLite 历史和 Checkpoint 重建 Project、RunState、AgentContract、Context、Memory、Governance、Skill/MCP/Hook 配置。
- 恢复后进入 `planning`，由用户检查后显式启动，不自动执行模型或工具。
- 可选从有 Snapshot 的 Checkpoint 还原工作区；默认保留崩溃后的当前工作区。
- 使用原 `run_id` 追加 `run.resumed` Trace，保留同一运行的审计链。
- 从 Trace 重算并延续步骤、模型调用、工具调用和 Token 使用量，恢复不能刷新 AgentContract 预算。

## 安全边界

- 活动 Run、已完成 Run 和缺失工作区不能恢复。
- Snapshot 恢复仍使用 Patch Pipeline 的路径保护。
- 模型凭据不进入 Checkpoint，恢复启动时重新从 Secret Manager/环境读取。
