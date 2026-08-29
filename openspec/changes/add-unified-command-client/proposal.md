# 增加统一命令入口与 CLI Companion

## 变更内容

- 增加确定性的 Slash Command 解析器，将 `/fix`、`/test`、`/review`、`/explain`、`/spec` 映射到任务模式。
- Web 任务输入复用该解析规则，普通自然语言行为保持不变。
- 增加 `miniagent` CLI，通过同一 Daemon API 完成项目、Run、取消、追加要求、审批、压缩、回放和报告操作。
- CLI 默认输出便于人读的 JSON，并通过 `MINIAGENTOS_DAEMON_URL` 或 `--url` 连接本地 Daemon。

## 边界

CLI 不直接访问 Workspace、数据库或模型密钥；所有行为仍由 Daemon 的 Contract、Guard、Sandbox 和 Trace 管理。
