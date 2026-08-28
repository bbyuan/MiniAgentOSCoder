# 打通补丁审批执行闭环

## 背景

当前 Agent Loop 只注册读文件、搜索和测试工具。Patch Pipeline 与审批 API 虽然已有骨架，但模型无法提交补丁，审批也不能恢复挂起动作，工作台只能展示静态“暂无审批”。这使 P0 核心链路停留在诊断阶段。

## 变更内容

- 注册受 Patch Pipeline 管理的 `apply_patch` 工具，写入前执行统一 diff 解析与 `git apply --check`。
- Run Worker 在补丁动作上创建审批请求和检查点，并以可取消方式等待用户决策。
- 批准后创建文件快照、应用补丁并从当前 Agent Loop 继续；拒绝后把原因作为 observation 交回模型。
- Daemon API 暴露当前待审批请求，并让 approve/deny 真正驱动运行。
- 工作台展示补丁目标、风险、变更统计和 diff，并提供批准与拒绝操作。
- Trace 与 Artifacts 持续记录审批、快照、补丁和测试结果。

## 能力影响

- `tool-gateway`：增加补丁预检和一次性批准执行。
- `agent-runtime`：增加可等待审批的独立 Run Worker 和可恢复执行。
- `desktop-workbench`：增加真实补丁审批交互。

## 不在本阶段

- 跨重启恢复正在等待的内存执行线程。
- 批准规则持久化和 `approve_pattern` 的完整策略引擎。
- 可编辑补丁、分块审批和图形化三方 Diff 编辑器。
