# 设计

## 本地遥测

`EvaluationService` 读取 SQLite Run 摘要，并在验证 Trace 路径仍位于对应 `runs/{run_id}` 后统计事件。响应仅包含聚合数字：

- Run 总量与终态分布。
- 完成率、测试通过率和补丁接受率。
- 平均步骤、模型调用、工具调用、Token、修复轮数和耗时。
- 审批请求/通过、Guard 阻止、Context 压缩和恢复次数。
- 按确定性 `termination_reason` 分类的失败分布。

任务文本、项目路径、文件名、Trace Payload、模型消息和代码内容不得进入 Evaluation 响应。损坏或缺失的 Trace 计入 `evidence_gaps`，但不阻断其他 Run 的统计。

## Benchmark Harness

任务清单位于 `benchmarks/tasks.jsonl`，每条记录声明任务 id、模式、版本化样例项目、测试 argv、成功条件、预期变更文件和 Fixture Action IR。Harness 对每个任务：

1. 将 `benchmarks/projects/{project}` 复制到临时目录。
2. 扫描和索引副本，编译与正常 Run 相同的 AgentContract。
3. 按 Variant 构造 Context Pack。
4. 通过同一个 AgentRunLoop、Tool Gateway、Guard、Sandbox 和 Patch Pipeline 执行。
5. 在隔离副本中自动批准声明范围内的 Patch，并记录该决策。
6. 独立运行清单中的最终测试 argv，计算成功条件。

`fixture` Provider 使用清单中的固定 Action IR，只证明 Harness 和运行时路径可重复。`configured` Provider 使用本地模型配置，用于实际质量实验。默认 Variant 为：

- `full_context`：任务、项目画像、规则、索引检索与相关代码片段。
- `task_only`：只保留任务、项目画像和计划，仍保留全部执行治理。

## 报告

每次评测写入时间戳结果目录，并原子更新 `benchmarks/results/latest.json` 与 `latest.md`。报告包含运行环境、Provider、Variant、逐任务结果、聚合指标和 Variant 差值，不包含临时工作区绝对路径或密钥。

## Workbench

Run Center 增加“本地洞察”入口。洞察使用紧凑指标、状态分布和失败分类，明确标注“仅本机聚合、不采集代码”。零数据、部分证据缺失和加载失败分别呈现，不伪造百分比。
