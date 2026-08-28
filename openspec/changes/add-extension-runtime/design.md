# 设计

## Extension Catalog

每个 Run 在创建时从项目 `.agent/` 读取三类声明：

```text
skills.yaml -> Skill cards + validated SKILL.md paths
mcp.yaml    -> stdio server manifests
hooks.yaml  -> trusted lifecycle hook manifests
```

如果项目没有对应文件，则使用 MiniAgentOS 仓库内置 Skill Registry，MCP 与 Hook 默认为空。所有 id 必须唯一；相对路径必须位于 registry 所在项目根目录；命令必须是 argv 数组。Catalog 返回每项的有效性与非敏感诊断，不返回环境变量值。

Run 保存不可变的 Catalog snapshot 和可编辑的 `ExtensionSettings`：active skill ids、enabled MCP server ids、enabled hook ids。设置仅在 Run 为 `planning` 且 Worker 未启动时可修改，未知、无效或 mode 不兼容的扩展不能激活。

## Skill Runtime

Skill 使用两级披露：创建 Run 时只加载卡片并按 mode 推荐；启动时只读取已激活 Skill 的 `SKILL.md` 正文。Planner Request 增加 `Active skills` 段，每个 Skill 正文限制长度，并在 metadata 中记录 skill ids。Skill 内容被标为项目约束数据，不能覆盖 Action IR、Contract 和 Tool Gateway 的系统约束。

Run 启动时写入 `skill.activated`，包含 id、名称、来源路径和正文摘要哈希，不复制全文到 Trace。未激活 Skill 不占用 Planner 上下文。

## stdio MCP Adapter

每个启用 Server 由 Run Worker 在启动阶段创建独立 stdio 会话：

```text
spawn argv with sanitized environment
-> initialize
-> notifications/initialized
-> tools/list
-> convert each tool schema to ToolDescriptor
-> register mcp__{server_id}__{tool_name} in Tool Gateway
```

Descriptor 默认 effect 为 `mcp.call`，risk 为 `high`，approval policy 为 `approval_required`；Server manifest 可按工具将 effect/risk 收紧，但不能声明 Contract 未允许的 effect。调用经 Tool Gateway 完成全部 policy evaluation 后才发送 `tools/call`。返回 content 转为有界、脱敏的 `ToolResult`。

MCP 生命周期写入 `mcp.server.started`、`mcp.tools.discovered`、`mcp.tool.called`、`mcp.server.failed` 和 `mcp.server.stopped`。Run 结束或失败必须终止子进程。协议超时、无效 JSON-RPC、重复工具名和 Server 退出均产生受控失败，不能导致 Daemon 泄漏进程。

## Trusted Hook Pipeline

Hook manifest 包含 id、event、argv、timeout、failure policy 与 enabled 默认值。首阶段支持：

- `run.before` / `run.after`
- `tool.before` / `tool.after`

Hook 只允许项目本地声明并由用户在准备阶段显式启用。Hook 使用 SandboxExecutor 执行，cwd 固定为 workspace，环境只增加非敏感的 event、run id、tool 和 action id。`warn` 失败只写 Trace；`block` 失败在 before 阶段阻止后续操作。after Hook 永远不能改写 ToolResult 或把失败结果伪装成成功。

每次执行写入 `hook.started` 与 `hook.finished`，记录 hook id、event、return code、duration、sandbox id 和失败策略，不把完整环境或无限输出写入 Trace。

## API

- `GET /runs/{run_id}/extensions`：返回 Catalog、设置、是否可编辑，以及由 Trace 重建的 Skill/MCP/Hook 证据。
- `PUT /runs/{run_id}/extensions`：启动前替换 active skills、enabled MCP servers 与 enabled hooks。

Extension 设置与 Governance 设置相互独立，但 MCP Tool 和 Hook 进程服从同一个 AgentContract、Sandbox profile 和 Trace。API 不执行下载、安装或网络发现。

## Workbench

Extensions 标签包含：

- Skills：推荐原因、mode、默认工具、风险和激活开关。
- MCP：transport、命令首项、启用状态、发现工具数和错误状态。
- Hooks：生命周期、失败策略、Sandbox 与启用开关。
- Evidence：激活、发现、调用和 Hook 执行的时间线摘要。

准备阶段允许编辑并统一保存；启动后控件变为只读。SSE 收到 `skill.*`、`mcp.*` 或 `hook.*` 时刷新。
