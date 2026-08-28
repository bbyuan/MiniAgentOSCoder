# 增加持久化 Run Center

## 背景

当前 Project、Run、Contract、Context 与 Result 仅保存在 Daemon 进程内存中。虽然工作区 `runs/{run_id}` 已写入 Trace、Report、Patch 与 Checkpoint，但 Daemon 重启后无法列出历史项目和运行，也无法从多个运行中比较模型调用、工具调用、Token、状态和变更结果。这会使桌面客户端退化为单次会话页面。

## 变更内容

- 使用 Python 标准库 SQLite 建立本机持久化目录，保存 Project 与 Run 的可检索摘要。
- Project 使用规范化路径生成稳定 id，重复打开更新画像与最近使用时间，不产生重复项目。
- 在 Run 创建、启动、等待审批、恢复、取消和终态时写入状态快照。
- 增加 Project/Run 历史、Run 详情和双 Run 对比 API。
- Run 详情关联已有 `report.md`、`trace.jsonl`、`patch.diff`，不复制大文件进数据库。
- 增加 Run Center 工作台，支持项目筛选、状态筛选、历史详情和两次运行对比。

## 能力影响

- `agent-runtime`：持久化生命周期快照和重启后的历史可见性。
- `desktop-workbench`：统一 Run Center、详情与对比视图。
- `trace-report`：数据库作为目录，Trace/Report 仍是执行证据权威来源。

## 不在本阶段

- 不自动恢复崩溃中的模型或工具调用；重启时未完成 Run 标记为 interrupted。
- 不把 SQLite 用作 Trace、Context 或模型输出的大对象存储。
- 不实现云端同步、多用户共享或远程任务队列。
- 不在本阶段引入 Electron/Tauri 依赖；桌面打包使用本阶段稳定 API 与数据目录。
