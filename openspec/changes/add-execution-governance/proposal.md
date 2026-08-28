# 增加执行治理与 Sandbox 控制中心

## 背景

现有 Tool Gateway 已具有 effect、budget、schema、path、command 和 approval 校验，但这些检查分散在 Gateway 与工具 handler 中。Trace 无法回答一次调用依次通过了哪些 Guard，Workbench 也只能展示静态 Contract。`run_test` 直接继承 Daemon 环境并调用子进程，缺少统一的环境净化、输出限制和可解释 Sandbox 边界。

## 变更内容

- 为每次工具 Action 生成结构化 `PolicyEvaluation`，记录逐项 Guard 决策、耗时、规则、结果和 Sandbox profile。
- 将 effect、budget、schema、path、command、tool override、preflight、approval 和 sandbox 检查收敛到 Tool Gateway 决策链。
- 增加 `SandboxExecutor`，统一执行测试进程的 argv、cwd、环境、HOME/TMP、进程组、超时和输出上限。
- 增加 standard/strict 两种本地 Sandbox profile，并诚实报告可保证能力与平台限制。
- 支持 Run 启动前将单个工具策略提高为 `approval_required` 或 `deny`，不允许覆盖项降低固有安全等级。
- 增加 Governance API 与 Workbench 视图，展示工具目录、Sandbox、策略覆盖和 Guard 决策历史。

## 能力影响

- `tool-gateway`：统一 Guard Pipeline、有效工具策略和结构化审计。
- `agent-runtime`：Sandbox 执行事件、报告治理摘要和 Run 前治理配置。
- `desktop-workbench`：可配置 Governance 视图与实时决策解释。

## 不在本阶段

- 不自动下载容器镜像或要求 Docker 才能运行。
- 不把进程级隔离描述为内核级网络或文件系统隔离。
- 不支持任意用户脚本 Hook；Hook 生命周期与受信任扩展在后续阶段实现。

