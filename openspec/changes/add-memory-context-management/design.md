# 设计

## 三层记忆

`short_term` 由 Runtime 根据 RunState、Plan、最近 Observation、变更文件、测试和预算即时生成，不落到共享文件，也不可由用户修改。Run 结束后，它随运行记录保留，但不会自动注入其他项目。

`project` 写入工作区固定路径 `.agent/memory/project.json`。Run 终止时，Runtime 只沉淀任务、结果、变更文件、测试结论和修复次数等短摘要；用户也可在 Memory 视图中创建、修改和删除项目约定。每条记录绑定项目与来源 Run。

`long_term` 写入 `.agent/memory/long-term.json`，仅保存用户确认的偏好、约定、保护路径、常用命令和业务规则。所有创建与更新都要求 `confirmed=true`，Runtime 不从对话或源码自动推断长期记忆。

两类持久记忆均采用固定路径、原子替换和稳定 ID。写入前执行 Secret Sensor，拒绝包含密钥特征的内容，并限制单条长度。Memory API 不接受客户端文件路径。

## 运行时接入

新 Run 创建时加载项目级与长期记忆，转换为低于任务和计划优先级的 ContextItem。Planner 读取 Context Pack 中选中和压缩后的实际内容，而不是只读取 ID。

工具执行后，最新 Observation 进入 Context Pack；上一条 Observation 降级为历史工具输出。超过阈值时触发自动压缩。Run 终止时先整合项目记忆，再生成报告，使 `memory_refs` 能出现在 Checkpoint 与 `report.md` 中。

所有写入、修改、删除和压缩产生结构化 Trace：事件只记录记忆 ID、作用域、类型、Token 变化和触发原因，不复制敏感内容。

## 上下文压缩

Context Pack 内部保存 `ContextItem` 的内容与状态，对外解释接口默认返回元数据和摘要，不暴露不必要的完整工具输出。

阈值策略：

- 低于 70%：保持原 Context，仅允许用户强制整理。
- 70% 至 85%：压缩早期对话、旧 Observation 和长工具输出。
- 85% 至 95%：进一步只保留任务、当前计划、关键文件、最新错误、当前 diff 和预算。
- 达到 95%：返回 `confirmation_required`；用户确认后才执行可能丢失细节的临界压缩。

压缩按优先级从低到高处理，并使用头尾片段、结构化计数和原始 Token 数生成确定性摘要。任务、当前计划、最新 Observation、当前 diff 与预算是受保护项。压缩项仍会进入模型请求；只有 omitted 项被排除。

`POST /runs/{run_id}/context/compact` 支持 `force`、`target_ratio` 和 `confirmed`。返回压缩前后 Token、压缩项、遗漏项、阈值状态和是否需要确认。每次有效压缩创建 Checkpoint 并追加 Trace。

## Memory API

- `GET /runs/{run_id}/memory` 返回三层记忆和统计。
- `POST /runs/{run_id}/memory` 创建项目级或长期记忆。
- `PUT /runs/{run_id}/memory/{memory_id}` 更新可持久记忆。
- `DELETE /runs/{run_id}/memory/{memory_id}` 删除可持久记忆。

短期记忆只读；长期记忆创建和更新必须显式确认。不存在的 Run、越界作用域、疑似密钥和超长内容返回受控错误。

## Workbench

Memory 标签以作用域切换展示三层记忆。短期层解释当前 Run 正在携带的信息；项目和长期层支持新增、编辑、删除。长期写入表单始终显示独立确认控件。

Context 标签展示预算进度、阈值状态、按类型的 Token 分布以及 selected/compressed/omitted 列表。用户可请求压缩；达到临界阈值时，界面展示压缩影响并要求二次确认。SSE 收到 `memory.*` 或 `context.compacted` 后刷新对应面板。

