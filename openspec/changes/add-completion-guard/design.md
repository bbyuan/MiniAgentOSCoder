# 设计

## 目标

Completion Guard 是运行时的终止协议，不是结果页上的装饰。模型只能申请结束，运行时依据已经发生且可追溯的动作作出确定性裁决。裁决既控制状态机，也形成用户和实验都能复核的证据。

## 数据模型

每次评估包含：

- `verdict`：`passed` 或 `blocked`。
- `mode`：本次 Run 的任务模式。
- `checks`：检查项列表，每项包含稳定 id、是否必需、是否通过、说明和证据。
- `summary`：适合模型反馈和用户阅读的结论。
- `attempt`：本次 Run 的第几次结束申请。

检查项使用稳定英文 id，界面通过 i18n 显示名称。证据来自 Action Observation、RunState 与 RunArtifacts，不解析模型的自然语言承诺作为成功依据。

## 模式策略

### Bugfix

- 必须提供非空完成说明。
- 必须至少成功应用一次补丁。
- 最新一次已应用补丁后必须存在成功测试。
- 必须存在变更文件证据。

### Feature 与 Spec

- 必须提供非空完成说明。
- 必须至少成功应用一次补丁并存在变更文件。
- 最新补丁后必须成功测试。

### Review

- 必须提供非空评审结论。
- 不得成功应用补丁或产生变更文件。
- 必须至少执行一次只读检查动作，例如文件读取、目录扫描或搜索。

### Chat

- 必须提供非空回答。
- 不得成功应用补丁或产生变更文件。
- 不强制工具调用或测试。

未知模式采用保守通用策略：要求非空说明，并在存在已应用补丁时要求补丁后的成功测试。

## 运行循环

`AgentRunLoop` 接收一个完成评估回调。遇到 `finish` 时：

1. 解析完成说明并调用评估器。
2. 记录 `completion.evaluated`。
3. 若被阻止，追加 `finish` 类型的失败 Observation，包含失败检查 id 和人类可读缺口；记录 `completion.rejected`，随后进入下一规划步。
4. 若通过，将评估附在 `RunLoopResult`，记录 `completion.passed`，再发出 `run.finished`。

如果被拒绝后耗尽步骤或模型预算，Run 保持失败状态；最后一次评估仍进入结果、报告和历史，明确显示“未满足验收”，不能回退成普通的预算失败而丢失原因。

## 证据来源

- 补丁：成功的 `apply_patch` Observation、`RunState.applied_patches`、`changed_files`。
- 测试：`run_test` Observation 的顺序和成功状态，确保成功测试发生在最新补丁之后。
- 只读检查：Tool Descriptor 的只读动作集合及成功 Observation。
- 完成说明：当前 `finish` 的 `message` 或 `rationale`。

评估不信任最终说明中“已测试”“已修改”等词语，也不以 pytest 文本格式作为是否成功的唯一依据。

## 持久化与报告

`runs` 表增加 `completion_json`，迁移通过检查现有列后执行增量 `ALTER TABLE`，兼容已有数据库。历史列表和详情返回结构化评估；报告增加 Completion Guard 章节，逐项列出通过状态和证据。

## 工作台

- Preflight 在执行前展示当前模式的验收预期，让用户知道怎样才算完成。
- 终态 CompletionSummary 展示总裁决及检查项，不只展示模型总结。
- Run Center 历史详情复用同一证据板，支持答辩时从历史 Run 复核结果。
- 检查项同时使用图标、文字和状态，不仅依赖颜色。

## 安全与可复现性

守卫是本地确定性代码，不增加模型调用、外部网络和凭据权限。相同模式与相同 Observation 序列产生相同裁决，便于回放和后续评测。
