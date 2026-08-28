# Repair And Recovery 增量规格

## ADDED Requirements

### AR-013 同一循环内的多轮修复

Runtime SHALL 将失败测试的结构化 Observation 交回当前 Agent Loop，并在统一预算约束内允许生成后续补丁。

#### Scenario: 测试失败后继续修复

- GIVEN 已批准补丁的测试执行失败
- WHEN Run Worker 记录工具结果
- THEN Run SHALL 转为 `repairing` 并递增修复轮次
- AND 下一次模型请求 SHALL 包含该失败 Observation
- AND 后续补丁 SHALL 再次经过预检与用户审批

#### Scenario: 修复后测试通过

- GIVEN Run 已经进入至少一轮修复
- WHEN 后续测试通过
- THEN Runtime SHALL 记录 `repair.completed`
- AND Run SHALL 能继续到正常完成阶段

### AR-014 可操作恢复点

Runtime SHALL 将补丁写入前的 Checkpoint 与 Snapshot 暴露为可查询、可显式回滚的恢复点。

#### Scenario: 查询恢复点

- GIVEN Run 已经批准并应用至少一个补丁
- WHEN 客户端查询 Checkpoints
- THEN Daemon SHALL 返回检查点阶段、步骤、目标文件和快照可用性

#### Scenario: 回滚终态 Run

- GIVEN Run 已非活动且目标恢复点快照完整
- WHEN 用户确认回滚该检查点
- THEN Runtime SHALL 恢复原有文件并移除该补丁新建的文件
- AND SHALL 记录回滚 Trace 且保留原 Run 的终态历史

#### Scenario: 拒绝活动 Run 回滚

- GIVEN Run Worker 仍在执行或等待审批
- WHEN 客户端请求回滚
- THEN Daemon SHALL 返回冲突错误
- AND SHALL NOT 修改工作区文件

### DW-012 Recovery 工作台

Workbench SHALL 展示恢复点、修复轮次和可用状态，并要求用户确认后才调用回滚。

#### Scenario: 从工作台恢复

- GIVEN 一个带完整 Snapshot 的非活动 Run
- WHEN 用户在 Recovery 标签中确认恢复
- THEN Workbench SHALL 调用对应回滚 API
- AND SHALL 刷新恢复点、Artifacts 与 Trace
