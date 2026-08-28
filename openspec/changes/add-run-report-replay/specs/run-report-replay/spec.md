# Run Report And Trace Replay 增量规格

## ADDED Requirements

### AR-015 真实运行工件收尾

Runtime SHALL 为真实 Agent Run 保存已应用补丁，并在终态生成经过脱敏的确定性 Markdown 报告。

#### Scenario: 保存多轮补丁

- GIVEN Run 先后成功应用初始补丁和修复补丁
- WHEN Patch Pipeline 返回成功结果
- THEN Runtime SHALL 按执行顺序将两个补丁写入 `patch.diff`
- AND SHALL NOT 写入被拒绝或应用失败的补丁

#### Scenario: 生成终态报告

- GIVEN Run 已完成、失败或取消
- WHEN Runtime 完成 RunState 和 Artifacts 更新
- THEN SHALL 写入 `report.md`
- AND 报告 SHALL 包含任务、终态、变更、测试、修复、预算、契约、上下文和 Trace 摘要
- AND SHALL NOT 包含检测到的密钥值

### AR-016 只读 Trace Replay

Daemon SHALL 将现有 Trace 作为只读事件快照返回，且回放不得触发任何模型或工具副作用。

#### Scenario: 回放已完成 Run

- GIVEN Run 已完成且存在 `trace.jsonl`
- WHEN 客户端请求 Replay
- THEN Daemon SHALL 返回有序事件、事件总数和 `read_only=true`
- AND SHALL NOT 创建 Worker、模型调用或工具调用

### DW-013 报告与时间轴回放

Workbench SHALL 展示可导出的运行报告，并以客户端时间游标播放只读 Trace 快照。

#### Scenario: 查看并导出报告

- GIVEN 终态 Run 已生成报告
- WHEN 用户打开 Report 标签
- THEN Workbench SHALL 展示报告内容与工件状态
- AND SHALL 能将 Markdown 下载为本地文件

#### Scenario: 控制 Trace 回放

- GIVEN 终态 Run 的 Replay 快照已经加载
- WHEN 用户播放、暂停、单步、拖动进度或改变倍速
- THEN Workbench SHALL 更新当前事件和游标
- AND SHALL NOT 请求执行任何历史 Action
