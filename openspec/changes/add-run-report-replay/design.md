# 设计

## 工件收尾

新增 `RunArtifactWriter`，只写入 `runs/{run_id}`：

- `append_patch` 在 `apply_patch` 成功后写入该动作的 unified diff。多轮修复使用带序号的分隔注释按批准顺序累计，失败或拒绝的补丁不进入文件。
- `write_report` 在 RunState 已更新为终态后生成 Markdown。报告内容来自结构化运行数据，不再次调用模型，因此结果稳定、可测试且不会增加成本。

报告包含任务、模式、终态、最终回答、变更文件、补丁数量、测试命令与结果、修复轮次、恢复状态、模型/工具/Token 预算、Contract 副作用与策略、Context 来源、终止原因和 Trace 事件数。所有文本经过 Secret Sensor，报告不会记录 API Key 或环境变量值。

终态事件顺序为：Agent Loop 终止事件 -> RunState/Artifacts 更新 -> 写入报告 -> `report.generated` -> 最终 `run.transitioned`。SSE 因此不会在报告事件发送前关闭。

## 报告 API

`GET /runs/{run_id}/report` 在报告尚不可用时返回 `available=false`，终态后返回 Markdown 内容、路径、生成时间、补丁可用状态和文件列表。路径仅用于本地解释，不接受客户端指定。

回滚成功后重新生成报告并追加新的 `report.generated`，但原执行 Trace、终止原因和测试历史保持不变。报告明确标注 `rolled_back_to`，避免把“运行完成时状态”和“当前工作区状态”混淆。

## Trace Replay

Replay API 读取既有 `trace.jsonl` 并返回不可变事件快照、事件总数以及 `read_only=true`。服务端不创建 Worker，不构造 Tool Gateway，也不调用 ModelClient。

Workbench 获取快照后在本地维护 `cursor`：

- 播放按倍速推进游标；暂停不丢失位置。
- 前后单步和 range slider 直接移动游标。
- 重新开始将游标归零。
- 当前事件展示角色、时间、类型和格式化 payload。
- 播放到末尾自动暂停。

Live Trace 与 Replay 快照分离。活动 Run 继续使用 SSE；只有终态 Run 启用 Replay，避免“新事件正在追加”与固定时间轴产生歧义。

## 安全与失败

- Report Writer 只允许写入当前 Run 目录中的固定文件名。
- 报告生成失败不会抹掉 Run 终态；Runtime 记录 `report.failed` 并返回受控的不可用状态。
- 下载由前端从 Daemon 返回的 Markdown 创建临时 Blob，不暴露任意文件读取接口。
- Replay 永远不接受 Action、命令或工具参数作为输入。
