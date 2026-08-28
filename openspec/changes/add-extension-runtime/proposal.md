# 增加 Skill、MCP 与 Hook 扩展运行时

## 背景

当前仓库已经有 `.agent/skills.yaml` 和若干 `SKILL.md`，但运行时只读取卡片，Skill 不会参与 Planner。`.agent/config.yaml` 中的 MCP 仍为空配置，Tool Gateway 规格中的 stdio MCP Adapter 尚未实现。Hook 生命周期也没有对应模型、执行边界、Trace 或工作台，因此扩展能力无法形成可管理、可验证的 AgentPaaS 控制面。

## 变更内容

- 增加统一 Extension Catalog，校验并展示 Skill、MCP Server 与 Hook。
- 按 Run mode 推荐 Skill，支持启动前启停，并只向 Planner 注入已激活 Skill 的正文。
- 实现 stdio MCP Client 的 initialize、tools/list 与 tools/call，将远程工具转换为 `ToolDescriptor` 后注册到 Tool Gateway。
- MCP 工具默认使用 `mcp.call` effect、中高风险和人工审批，不允许绕过 Contract、Governance、Budget、Approval 与 Trace。
- 增加受信任项目 Hook，支持 run/tool before/after 生命周期，使用 argv 而非 shell 并通过 SandboxExecutor 执行。
- 增加 Run Extension API 与 Workbench，启动前配置，启动后展示激活、发现、调用和 Hook 执行证据。

## 能力影响

- `agent-runtime`：Skill 激活、Planner 渐进披露和 Hook 生命周期。
- `tool-gateway`：动态 MCP Descriptor 注册与统一治理。
- `desktop-workbench`：Extension 控制面与运行证据。

## 不在本阶段

- 不提供远程 HTTP/SSE MCP transport、OAuth 或自动安装 MCP Server。
- 不允许 Hook 使用 shell 字符串、修改治理配置或跳过 Guard。
- 不实现在线 Skill Marketplace、自动下载 Skill 或任意代码插件。
- 不把 MCP Server 的存活状态等同于其外部服务一定可用。
