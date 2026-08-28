# Proposal: Tauri Desktop Shell

## Why

MiniAgentOS Coder 已具备本地 Daemon 与完整 Workbench，但当前仍要求用户分别启动 Python 与 Vite，不能作为一个真正可下载、可启动、可退出的桌面产品。桌面化必须统一管理界面和运行时生命周期，同时保留 CLI 复用同一 API 的架构。

## What Changes

- 在现有 React 前端中加入 Tauri 2 桌面壳，不复制第二套 UI。
- 由 Rust 层选择本机端口、启动 Daemon、等待健康检查并在退出时回收进程。
- 开发态使用仓库 Python 虚拟环境，发布态使用 PyInstaller self-contained sidecar。
- 前端启动时从桌面命令获取动态 Daemon URL；普通浏览器开发仍回退到 `VITE_DAEMON_URL`。
- 将运行历史数据库放入桌面应用数据目录，不写安装包内部目录。
- 增加单实例、最小 CSP、loopback-only 监听、故障状态和构建脚本。

## Out Of Scope

- 自动更新、代码签名、公证和安装器分发流水线。
- Windows/Linux 的实际构建产物；配置保持跨平台，产物必须在对应系统构建。
- 在桌面层复制 Agent Runtime、Tool Gateway 或 AgentPaaS 控制逻辑。
