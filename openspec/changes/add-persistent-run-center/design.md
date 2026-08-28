# 设计

## Local Catalog

Daemon 使用 `MINIAGENTOS_HOME/state.db`；未配置时默认为 `~/.miniagentos-coder/state.db`。测试通过依赖注入使用内存数据库，不能读取或清空真实用户目录。

SQLite 仅保存小型可检索字段：

```text
projects(project_id, canonical_path, profile_json, created_at, last_opened_at)
runs(run_id, project_id, task, mode, status, phase,
     created_at, updated_at, completed_at,
     termination_reason, final_message, budget_json,
     changed_files_json, applied_patches, repair_attempts,
     report_path, trace_path, patch_path, archived)
```

Project id 为 canonical path 的稳定 SHA-256 前缀。Run id 保持现有随机 id。数据库启用 foreign keys、WAL 和 busy timeout；所有 JSON 使用标准编码，不使用 pickle。

## Lifecycle Persistence

- `POST /projects/open` upsert Project。
- `POST /runs` 插入 planning Run 与 artifact 路径。
- `POST /runs/{id}/start` 更新 running。
- Worker 的状态转换、审批等待/恢复与终态通过持久化回调更新摘要。
- cancel、rollback 与报告重新生成后同步对应字段。

Daemon 启动时将数据库中非终态且不在当前 Worker 管理的 Run 标记为 `interrupted`，保留最后 phase 和证据路径。历史可见，但不能无条件重放副作用或恢复模型循环。

## Source Of Truth

SQLite 是目录和筛选索引，不替代执行证据：

- 状态摘要、筛选和对比来自 SQLite。
- 报告内容从已记录的 `report_path` 读取，并验证路径仍在 Project workspace。
- Trace 事件数量和最近事件从 `trace.jsonl` 读取。
- 文件缺失时返回 availability=false，不伪造内容。

## API

- `GET /history/projects`：按最近打开排序，返回运行数与最近运行状态。
- `GET /history/runs`：按 project/status/query/archived 筛选并分页。
- `GET /history/runs/{run_id}`：返回摘要、Project、artifact availability、报告和 Trace 摘要。
- `POST /history/compare`：比较恰好两个 Run 的状态、步数、模型/工具调用、Token、补丁、文件、测试和耗时。
- `PUT /history/runs/{run_id}/archive`：只切换归档标记，不删除证据文件。

API 对未知 Run 返回 404；非法路径、越界分页和不足两个 Run 返回受控错误。

## Run Center

顶部 History 控件打开工作区级抽屉：

- 左侧为 Project 与状态过滤、文本搜索。
- 主区为紧凑 Run 列表，展示任务、模式、状态、时间和核心预算。
- 详情区展示结果、报告、Artifacts 与 Trace 摘要。
- 选择恰好两个 Run 后进入 Compare，按同一指标并排展示差值。

Run Center 不复制当前 Run Inspector。活动 Run 继续在主工作台实时展示；历史中心负责跨会话检索、证据阅读和比较。
