# 扩展受控工具与本地工具控制面

## 背景

AgentContract 已声明 `list_files`、`run_lint` 和 `run_command` 策略，Workbench 也能展示并覆盖工具策略，但内置 Tool Registry 目前只有文件读取、代码搜索、测试和补丁四项。声明、运行时和管理面之间尚未闭合。

## 变更内容

- 增加工作区目录列举、Lint、受审批通用命令、Git 状态和 Git Diff 工具。
- 所有进程工具继续使用无 Shell argv 执行、命令 Guard、Sandbox、预算与 Trace。
- 通用命令固定为高风险且必须单次审批；Git 工具只暴露确定的只读子命令。
- Governance API 和现有工具管理面自动展示完整 Registry、风险、Effect 和有效策略。
- 增加目录边界、生成目录过滤、命令审批、危险命令拒绝和 Git 只读行为测试。

## 不在本阶段

- Git commit、push、分支写入和任意网络命令。
- 未经用户审批的通用 Shell 执行。
- 内核级容器隔离。
