# 设计

内置 Registry 保持单一来源。Daemon 执行和 Governance 面板都从 `create_builtin_tool_registry` 获取相同 `ToolDescriptor`，因此新增工具天然共享 Contract、Effect、Risk、ApprovalPolicy 和 per-run override。

- `list_files`：`fs.read`、低风险、自动执行，限制在工作区并过滤生成目录。
- `run_lint`：`shell.exec`、中风险、自动执行，只允许已知开发工具前缀。
- `run_command`：`shell.exec`、高风险、必须审批，仍拒绝 Shell 操作符与危险可执行文件。
- `git_status`、`git_diff`：`fs.read`、低风险，命令和参数由 Runtime 固定，模型不能注入参数。

所有进程输出继续脱敏、限长并记录 Sandbox 元数据。不存在 Git 仓库时返回结构化失败，不中断 Worker。
