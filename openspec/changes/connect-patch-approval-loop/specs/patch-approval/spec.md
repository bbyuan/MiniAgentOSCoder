# Patch Approval 增量规格

## ADDED Requirements

### TG-005 补丁预检与一次性批准

Tool Gateway SHALL 在补丁写入前完成工作区路径校验和 dry-run，并且只有用户一次性批准后才执行真实写入。

#### Scenario: 拒绝不可应用补丁

- GIVEN 模型提交的统一 diff 无效或目标逃逸工作区
- WHEN `apply_patch` 执行预检
- THEN Tool Gateway SHALL 返回失败 Observation
- AND SHALL NOT 创建审批或修改文件

#### Scenario: 应用已批准补丁

- GIVEN 补丁已经通过预检并等待审批
- WHEN 用户选择批准一次
- THEN Runtime SHALL 先保存目标文件快照
- AND Patch Pipeline SHALL 只执行该待审批动作一次

### AR-012 可恢复审批等待

Run Worker SHALL 在不阻塞 Daemon API 的情况下保存当前循环上下文并等待审批，决策后从同一动作继续。

#### Scenario: 等待期间批准

- GIVEN Run 正在等待补丁审批
- WHEN 客户端批准对应 approval id
- THEN Run SHALL 从 `waiting_approval` 转为 `applying_patch`
- AND SHALL NOT 重复此前的模型调用或工具调用

#### Scenario: 等待期间取消

- GIVEN Run 正在等待补丁审批
- WHEN 用户取消 Run
- THEN 等待 SHALL 被唤醒
- AND Run SHALL 以 `cancelled` 结束且补丁不落盘

### DW-011 补丁审批工作台

Workbench SHALL 展示真实待审批补丁，并允许用户批准一次或带原因拒绝。

#### Scenario: 审阅补丁

- GIVEN Daemon 发出 `approval.requested`
- WHEN 用户查看 Overview
- THEN 界面 SHALL 显示风险、副作用、目标文件、增删统计和 diff
- AND 决策按钮 SHALL 在提交期间阻止重复操作
