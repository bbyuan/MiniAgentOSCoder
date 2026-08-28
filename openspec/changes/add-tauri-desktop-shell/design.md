# 设计

## Process Model

```text
MiniAgentOS Coder.app
  -> Tauri/Rust host (single instance)
      -> choose 127.0.0.1 ephemeral port
      -> start Python Daemon
      -> poll /health with bounded timeout
      -> expose desktop_runtime_status command
  -> React Workbench
      -> initialize API base from Rust command
      -> use the same HTTP/SSE Daemon contract as browser and future CLI
```

Rust 是本机进程监督者，不实现 Agent 行为。Daemon 仍拥有 Contract、Context、Memory、Tools、Guard、Sandbox、Trace 和 History。React 不直接调用 shell，也不获得任意进程执行权限。

## Development And Production

- `tauri dev` 运行现有 Vite dev server，并从仓库 `backend/.venv` 启动 Uvicorn。
- `desktop:sidecar` 使用 PyInstaller 将 `backend/desktop_entry.py`、Python 依赖与默认 `.agent` 配置打成平台原生可执行文件。
- sidecar 文件名添加 Rust target triple 后缀，并仅在 production Tauri config 中声明 `externalBin`。
- `tauri build` 先构建 sidecar 与前端，再生成当前平台桌面包。PyInstaller 不是交叉编译器，因此每个平台在对应 runner 上构建。

## Lifecycle

1. Desktop setup 创建应用数据目录并设置 `MINIAGENTOS_HOME`。
2. 绑定 `127.0.0.1:0` 获得可用端口，释放后立即启动 Daemon。
3. 最多等待固定时限，通过原始 TCP HTTP 健康检查确认 `/health` 返回成功。
4. 成功后记录 URL、PID、启动模式和 ready 状态；前端初始化后才渲染 Workbench。
5. 启动失败时仍打开故障界面，展示可恢复诊断，不无限白屏。
6. 应用退出时终止被管理子进程；非正常退出遗留的执行 Run 由现有 History 启动恢复标记为 interrupted。

第二实例不启动第二个 Daemon，而是聚焦现有窗口。

## Security Boundary

- Daemon 仅监听 `127.0.0.1`，不监听局域网地址。
- 动态 API URL 只由受信任 Rust command 提供。
- Tauri CSP 仅允许自身资源、IPC 与 loopback HTTP/SSE。
- 前端没有 Shell Plugin scope，不可启动任意命令或 sidecar。
- API key 继续由 Daemon 环境读取，不进入 Rust 状态、Tauri config 或前端。
- Desktop 仅向 sidecar 传递明确环境变量，保留现有 Guard/Sandbox 边界。

## Packaging

`backend/desktop_entry.py` 是冻结入口，负责加载根目录 `.env`（开发）或继承桌面环境（发布），然后调用 Uvicorn。默认 Agent 配置通过统一路径解析器在 source、环境覆盖和 PyInstaller `_MEIPASS` 三种布局间解析。

生成的 sidecar、Rust target、前端 dist、PyInstaller build/dist 均不提交。仓库提交可重现的配置、入口与构建脚本。
