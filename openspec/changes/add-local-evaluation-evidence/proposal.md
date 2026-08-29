# 增加本地评测证据

## 背景

MiniAgentOS Coder 已经能够记录单次 Run 的状态、预算、测试、审批和 Trace，但还不能回答“系统整体是否有效”“失败主要发生在哪里”“Context Pack 是否带来收益”。项目需要把这些证据组织成可重复、可比较、可汇报的评测能力。

## 变更内容

- 增加只读取本地 Run 历史和 Trace 的 Telemetry 聚合器，输出完成率、测试通过率、补丁接受率、平均预算、治理事件和失败分布。
- 增加 Evaluation API 与 Workbench 本地洞察视图，不返回任务文本、项目路径、代码、Prompt 或凭据。
- 增加隔离 Benchmark Harness，从版本化任务清单复制样例项目，运行 Full Context 与 Task-only Context 配置，并生成 JSON 与 Markdown 报告。
- 增加 CLI 指标查询和 Benchmark 命令，使桌面端、CLI 和报告共享同一指标定义。

## 非目标

- 不上传遥测，不接入远程分析服务。
- 不在真实用户项目上批量执行 Benchmark。
- 不实现绕开 Action IR、Guard、Tool Gateway 或 Patch Pipeline 的不安全基线。
- 不把固定脚本模型的结果表述为真实模型质量；Fixture 模式只验证 Harness 可重复性。
