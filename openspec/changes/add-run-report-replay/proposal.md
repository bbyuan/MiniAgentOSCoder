# 增加运行报告与可控 Trace 回放

## 背景

真实 Agent Run 已经覆盖补丁审批、测试、修复、检查点和回滚，但结束后只有内存中的摘要与原始 Trace。项目成功标准要求每次 Run 产出 `patch.diff` 和 `report.md`，工作台规格也要求不重新执行工具的 Trace Replay。当前 Demo 脚本会手工写这些文件，真实 Run 尚未具备同等能力，`POST /replay` 也只是返回事件数组，没有可控回放体验。

## 变更内容

- 每次成功应用补丁后，将已批准 unified diff 追加到 Run 的 `patch.diff`。
- Run 进入任一终态时，基于 RunState、AgentContract、Context、Artifacts、Result 和 Trace 确定性生成 `report.md`。
- 回滚后刷新报告中的工作区恢复状态，但不改写原 Trace 或原终止原因。
- 增加报告查询 API，返回可用状态、Markdown 内容和非敏感元数据。
- 强化 Replay API，返回事件总数和只读声明，不执行模型、工具或 Patch Pipeline。
- Workbench 增加 Report 标签，展示运行结论、验证与预算并支持下载 Markdown。
- Trace 标签增加播放、暂停、重新开始、前后单步、进度滑块和倍速控制。

## 能力影响

- `agent-runtime`：增加真实 Run 工件收尾和确定性报告生成。
- `desktop-workbench`：增加报告查看/导出和时间游标驱动的 Trace Replay。

## 不在本阶段

- 跨 Run 列表、搜索和对比。
- 重新执行历史模型请求或工具调用。
- PDF 报告、云端分享和签名归档。
