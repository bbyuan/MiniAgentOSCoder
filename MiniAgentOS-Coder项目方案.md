# MiniAgentOS Coder 系统设计方案

## 0. 最终设计摘要

MiniAgentOS Coder 的主线是做一个本地编程智能体运行时，而不是普通聊天式 demo。系统设计收敛为九个核心判断：

1. 把 AgentOS 落到 `AgentContract`、effect、cost envelope、checkpoint 和 trace replay 上，让“运行时治理”成为系统内核。
2. 把 LambdaAgentPaaS 落到 Agent Registry、Tool Registry、Skill Registry、Run Manager、Memory Manager 和 桌面管理面上，让“平台化组织”成为系统外壳。
3. 把产品形态统一成桌面工作台：图形化客户端、本地 runtime daemon、CLI companion 共享同一个后端。
4. 把上下文工程从简单拼接升级为 context item 排序、workspace index、相似片段检索、prefix/suffix 局部代码上下文和 `/compact` 压缩。
5. 把反馈闭环做完整：工具失败、guard 拒绝、测试失败、lint 失败都要回灌给 agent，并记录到 trace 中。
6. 把开发过程也规范化：用 `AGENTS.md`、`SKILL.md` 和 `openspec/` 形成 Spec-driven Development，让 agent 不只是会执行，也按规范开发。
7. 把安全边界说清楚：明确威胁模型、信任边界、prompt injection 防护、密钥保护和高风险命令审批。
8. 把运行状态机说清楚：run 不是一条线，而是可暂停、可审批、可恢复、可取消、可失败归因的状态迁移。
9. 把评测做成证据：不仅展示 demo，还要有 benchmark、消融实验和失败类型统计，证明 contract、context、trace 确实有用。

系统可以用一个公式概括：

```text
MiniAgentOS Coder = 桌面 Agent Workbench + 本地 AgentOS 内核 + 单机 AgentPaaS 管理面
                  + 规范驱动开发流程 + 可评测运行证据
```

## 1. 系统定位

MiniAgentOS Coder 是一个本地运行的编程智能体系统。用户给出一个编程任务后，系统可以自动理解项目结构、制定计划、读取代码、搜索相关文件、生成修改、执行命令、运行测试、根据错误继续修复，并把整个过程展示给用户。

它的核心不是“做一个聊天框”，而是实现一个完整的编程智能体运行时：

```text
模型负责思考下一步；
运行时负责管理工具、权限、上下文、记忆、预算、安全和执行轨迹；
用户通过桌面工作台观察、审批和接管 agent 的行为。
```

最终系统应该呈现为：

```text
一个可交互、可审计、可回放、可扩展的本地 Coding Agent。
```

## 2. 系统目标

系统需要完成五类目标。

### 2.1 能完成真实编程任务

系统应支持：

- 读取本地项目文件。
- 搜索代码和定位相关模块。
- 生成代码修改。
- 展示 diff 并等待用户确认。
- 执行命令和运行测试。
- 根据测试失败继续修复。
- 输出最终修改说明和验证结果。

### 2.2 能管理 agent 的行为

系统不能让模型直接操作本地环境。模型每一步都必须先输出结构化动作，再由运行时检查。

需要管理：

- 模型输出格式。
- 工具调用参数。
- 文件访问范围。
- 命令执行风险。
- 单次任务预算。
- 是否需要用户审批。
- 是否达到终止条件。

### 2.3 能展示 agent 的过程

用户不只看到最终结果，还能看到：

- agent 的任务计划。
- 当前执行到哪一步。
- 调用了哪些工具。
- 读取了哪些文件。
- 为什么修改这些代码。
- 测试是否通过。
- 上下文用了多少。
- 记忆写入了什么。
- 每一步 trace 记录。

### 2.4 能沉淀项目经验

系统应有记忆管理能力，保存项目级经验，例如：

- 项目技术栈。
- 常用测试命令。
- 代码风格偏好。
- 关键目录说明。
- 用户确认过的项目约定。

### 2.5 能作为平台化基础

第一版运行在本地，但架构上要具备平台化组织方式：

- agent 通过配置生成，而不是硬编码。
- tools、skills、memory、runs 都通过 registry 或 manager 管理。
- 每次运行都有 contract、trace、checkpoint 和 report。
- 桌面端、CLI 和后端 runtime 共享同一套 daemon API。

## 3. 总体架构

系统采用六层架构。第一层是桌面客户端壳，第二层是可复用的前端工作台，第三层开始才是 agent 和 runtime。这样产品形态统一，同时保留浏览器调试和 CLI 自动化能力。

```text
┌──────────────────────────────────────────────┐
│ Desktop Shell Layer                           │
│ Desktop App / Tray / Local Daemon Launcher    │
├──────────────────────────────────────────────┤
│ Workbench Layer                               │
│ React Workbench / CLI Companion / Run Report  │
├──────────────────────────────────────────────┤
│ Agent Layer                                   │
│ Orchestrator / Planner / Action Parser        │
├──────────────────────────────────────────────┤
│ Runtime / Control Plane Layer                 │
│ Contract / Context / Memory / Tool Gateway    │
│ Guard / Hook / Budget / Checkpoint / Trace    │
├──────────────────────────────────────────────┤
│ Execution Layer                               │
│ File Tools / Search Tools / Shell Tools       │
│ Test Tools / Git Tools / MCP Adapter / Sandbox│
├──────────────────────────────────────────────┤
│ Workspace Layer                               │
│ User Project / .agent / runs / traces         │
└──────────────────────────────────────────────┘
```

各层职责如下。

| 层级 | 职责 |
|---|---|
| Desktop Shell Layer | 提供桌面客户端、启动本地 runtime、管理项目目录和系统托盘 |
| Workbench Layer | 提供用户交互、运行过程展示、diff 审批、trace 回放；CLI 也是这一层的轻量入口 |
| Agent Layer | 负责任务规划、下一步决策、结构化动作生成 |
| Runtime / Control Plane Layer | 负责 agent 契约、上下文、记忆、工具网关、权限、安全、预算、检查点、轨迹 |
| Execution Layer | 负责真正执行文件、搜索、命令、测试、Git、MCP 工具 |
| Workspace Layer | 保存用户项目、配置、技能、运行记录和报告 |

## 4. AgentOS 与 LambdaAgentPaaS 的体现

这两个概念在项目里不是作为外部依赖出现，而是作为系统设计思想落到具体模块里。

更准确地说，本项目把它们拆成两层：

```text
AgentOS 层：定义 agent 如何被安全、可观测、可预算地执行。
AgentPaaS 层：定义 agent 如何被配置、注册、运行、复用和管理。
```

### 4.1 AgentOS 体现在哪里

AgentOS 关注的是：agent 不是普通函数调用，而是一种会访问环境、调用工具、消耗资源、产生副作用的运行实体。因此系统需要像操作系统一样管理它。

在本项目中，AgentOS 主要体现在运行时内核：

| AgentOS 关注点 | 本系统中的实现 |
|---|---|
| agent 行为可表示 | 用 `Plan IR` 和 `Action IR` 表示计划与动作 |
| agent 动作可检查 | 每个 action 先经过 parser、guard、budget、permission 检查 |
| 能力边界 | 每个工具标注 effect，例如 `fs.read`、`fs.write`、`shell.exec`、`test.run` |
| 安全隔离 | 用 Sandbox 限制文件访问、命令执行和高风险操作 |
| 资源约束 | 用 Budget 管理模型调用次数、执行步数、命令时间、上下文占用 |
| 运行状态 | 用 RunState 维护任务、计划、修改文件、测试状态和预算 |
| 可观测性 | 用 Tracer 记录模型请求、工具调用、权限审批、测试结果 |
| 可回放性 | 用 Replay 根据 `trace.jsonl` 复现完整执行过程 |

可以概括为：

```text
AgentOS = Action IR + Effect + Guard + Sandbox + Budget + RunState + Trace + Replay
```

这些模块组成项目里的“小型 AgentOS 内核”。它们负责回答一个问题：模型想做的这一步，系统能不能允许它做、应该怎么做、做完以后如何记录。

为了让 AgentOS 体现得更具体，系统中增加一个核心对象：`AgentContract`。

```json
{
  "agent_id": "miniagent-coder",
  "program": {
    "mode": "orchestrator",
    "roles": ["Planner", "CodeReader", "PatchWriter", "TestRunner", "Reviewer"],
    "max_steps": 20
  },
  "effects": {
    "allow": ["fs.read", "fs.write", "shell.exec", "test.run", "state.memory"],
    "deny": ["workspace.escape", "secret.read", "net.public"]
  },
  "cost_envelope": {
    "max_model_calls": 20,
    "max_tool_calls": 60,
    "max_input_tokens": 120000,
    "max_output_tokens": 20000,
    "max_wall_time_seconds": 600
  },
  "policies": {
    "read_file": "auto",
    "search_code": "auto",
    "write_patch": "approval_required",
    "run_test": "auto",
    "run_command": "approval_required"
  }
}
```

`AgentContract` 是运行前生成、运行中检查、运行后审计的统一对象：

```text
运行前：从配置、默认策略和用户选择生成 contract。
运行中：每个 action 都要检查 effect、budget、policy 和 sandbox。
运行后：report 展示 contract 是否被违反、哪些操作经过审批。
```

### 4.2 LambdaAgentPaaS 体现在哪里

LambdaAgentPaaS 关注的是：如何把 agent 组织成可配置、可扩展、可管理的平台能力。

在本项目中，它主要体现在平台化管理层：

| 平台化关注点 | 本系统中的实现 |
|---|---|
| 配置化创建 agent | 用 `.agent/config.yaml` 配置模型、工具、预算、权限和默认 skill |
| 统一工具入口 | 所有工具都通过 Tool Gateway 注册、检查和执行 |
| 外部工具扩展 | 用 MCP Adapter 把远程工具转换成统一 ToolDescriptor |
| Skill 管理 | 用 `.agent/skills/*/SKILL.md` 定义 bugfix、review、test-repair 等流程 |
| 记忆管理 | 设计短期、中期、长期三层 memory |
| 上下文管理 | 展示上下文占用、来源分布，并支持 `/compact` |
| 运行记录管理 | 每个任务生成 `runs/<run_id>/trace.jsonl`、`report.md`、`diff.patch` |
| 管理面 | 桌面工作台提供 Tools、Memory、Context、Trace、Settings 页面 |

可以概括为：

```text
LambdaAgentPaaS = Config + Tool Gateway + MCP Adapter + Skill + Memory + Context + Run Management + 桌面管理面
```

这些模块让系统不只是一个本地脚本，而是一个“本地单机版 AgentPaaS”。它们负责回答另一个问题：一个 agent 应该如何被配置、扩展、运行、记录和管理。

为了让 LambdaAgentPaaS 体现得更清楚，系统应该显式设计一个本地 Control Plane：

```text
Local Control Plane
  ├── Agent Registry       管理 agent 配置和版本
  ├── Tool Registry        管理工具、MCP、权限和风险等级
  ├── Skill Registry       管理 SKILL.md、触发条件和加载状态
  ├── Run Manager          管理 run_id、状态、取消、恢复和历史
  ├── Memory Manager       管理短期、中期、长期记忆
  ├── Context Manager      管理上下文选择、占用和压缩
  ├── Budget Manager       管理 token、调用次数、时间和成本 envelope
  ├── Secret Manager       管理模型 key 和环境变量注入
  └── Observability        管理 trace、metrics、report 和 replay
```

这组模块就是项目里的 PaaS 味道：虽然第一版运行在本地，但已经具备 registry、manager、policy、history 和 dashboard，而不是一个散装脚本。

### 4.3 二者在系统中的分工

二者不是两套并列功能，而是上下两层关系：

```text
AgentOS 负责运行时治理：
  action、effect、guard、sandbox、budget、trace

LambdaAgentPaaS 负责平台化组织：
  config、tool registry、mcp、skill、memory、context、run history、web 管理面
```

落到系统架构中就是：

```text
底层内核：Action IR、Effect、Guard、Sandbox、Budget、RunState、Checkpoint
平台能力：AgentContract、Agent Registry、Tool Registry、MCP、Skill、Memory、Context、Run History
用户呈现：桌面工作台、Diff 审批、Trace Replay、Context 面板、Memory 面板、Budget 面板
```

所以汇报时可以这样讲：

> MiniAgentOS Coder 的目标不是单纯做一个会改代码的 agent，而是把编程 agent 放进一个可管理的本地运行时。AgentOS 体现在运行时内核，负责约束和观测 agent；LambdaAgentPaaS 体现在平台化管理层，负责配置、工具、技能、记忆、上下文和运行记录；桌面工作台负责把这些能力变成用户能直接操作的产品。

### 4.4 最应该强化的三个体现点

第一是 `AgentContract`。它把“这个 agent 是什么、能做什么、最多花多少、哪些动作要审批”统一起来，是连接 AgentOS 与 AgentPaaS 的中心对象。

第二是 `CostEnvelope`。不要只说预算，要把预算变成可展示、可检查的 envelope：

```text
模型调用上限
工具调用上限
最大 step 数
最大上下文 token
最大输出 token
最大运行时间
可选价格估算
```

第三是 `Checkpoint`。编程任务可能中途等待审批、测试卡住、用户取消或服务重启，因此 run 应该可以保存和恢复：

```text
checkpoint = RunState + Plan + Memory Snapshot + Context Summary + Trace Cursor + Changed Files
```

这三个点会让项目明显不像普通 coding agent demo，而像一个小型 agent 操作系统。

## 5. 产品形态与运行方式

系统最终建议做成桌面客户端，而不是让用户分别打开一个网页和一套 CLI。

推荐产品形态：

```text
MiniAgentOS Desktop App
  ├── 内置 React Workbench
  ├── 启动 Local Runtime Daemon
  ├── 管理本地 workspace
  ├── 展示 plan、diff、trace、memory、context
  └── 提供 CLI Companion 复用同一个 runtime
```

用户看到的是一个图形化桌面应用：

```text
用户打开 MiniAgentOS Coder 桌面客户端
  -> 选择本地项目目录
  -> 输入编程任务
  -> agent 开始运行
  -> 客户端实时展示计划、工具、diff、测试和 trace
  -> 用户审批高风险操作
  -> 系统输出最终结果和报告
```

CLI 不是另一套产品，而是同一个 runtime 的命令行入口：

```bash
miniagent run "修复当前项目的测试失败"
miniagent chat
miniagent compact
miniagent replay runs/2026-08-27-001
```

整体关系：

```text
Desktop App  ─┐
              ├── Local Runtime Daemon ── Workspace Sandbox
CLI Companion ┘
```

开发阶段仍然可以用浏览器调试：

```bash
cd frontend
npm run dev

cd backend
uvicorn app.main:app --reload --port 8000
```

但最终演示时不要说“这是一个网页 + 一个 CLI”，而要说：

```text
这是一个本地桌面编程智能体客户端。
前端工作台只是被桌面壳承载；
CLI 只是同一个 runtime 的辅助入口。
```

## 6. 核心执行流程

一次任务的生命周期如下。

```text
1. 初始化任务
   创建 run_id，读取项目配置，扫描目录，初始化预算、记忆和 trace。

2. 构建上下文
   汇总用户任务、项目摘要、相关文件、当前计划、历史观察和可用工具。

3. 生成计划
   agent 把用户任务拆成若干步骤，例如定位问题、阅读文件、修改代码、运行测试。

4. 生成动作
   每轮模型只能输出一个结构化 action。

5. 运行时检查
   检查 action 格式、工具参数、权限、风险、预算和 sandbox 规则。

6. 执行动作
   调用对应工具，例如读取文件、搜索代码、应用 patch、运行测试。

7. 写入观察结果
   把工具结果写入 state、context、memory 和 trace。

8. 判断是否继续
   如果任务未完成或测试失败，进入下一轮；如果完成，则结束。

9. 生成报告
   输出最终回答、修改摘要、测试结果、diff 和 trace replay。
```

可以抽象成：

```text
Build -> Context -> Plan -> Act -> Check -> Execute -> Observe -> Repair -> Finish
```

## 7. Agent 架构

第一版采用：

```text
单 Orchestrator + 逻辑子角色
```

也就是说，系统中只有一个真正的主智能体循环，但在不同阶段使用不同角色提示和工作规范。

```text
Orchestrator
  |
  ├── Planner       拆解任务，维护计划
  ├── CodeReader    阅读代码，定位相关文件
  ├── PatchWriter   生成最小修改
  ├── TestRunner    执行测试，分析错误
  └── Reviewer      检查风险，总结结果
```

这样做的好处是：

- 第一版实现稳定，不需要处理复杂多智能体并发。
- 桌面工作台仍然可以展示“多角色协作”的过程。
- 每个动作都有角色标记，方便 trace 和评估。
- `spawn_task` 作为扩展动作保留，但不作为首版核心闭环。

示例 action：

```json
{
  "role": "CodeReader",
  "type": "read_file",
  "reason": "查看用户登录逻辑的实现",
  "arguments": {
    "path": "src/auth/service.py"
  }
}
```

## 8. Action IR

Action IR 是模型和运行时之间的协议。模型不能直接说“我想执行某某命令”，必须输出固定格式的 JSON 动作。

支持的 action 类型：

| 类型 | 作用 |
|---|---|
| `plan` | 创建或更新任务计划 |
| `read_file` | 读取文件 |
| `list_files` | 查看目录 |
| `search_code` | 搜索代码 |
| `write_patch` | 生成补丁 |
| `run_command` | 执行命令 |
| `run_test` | 运行测试 |
| `ask_user` | 请求用户确认 |
| `compact_context` | 触发上下文压缩 |
| `finish` | 结束任务 |

Action IR 示例：

```json
{
  "type": "run_test",
  "role": "TestRunner",
  "reason": "验证修改是否修复失败用例",
  "arguments": {
    "command": "pytest tests/test_auth.py"
  },
  "expected_effect": "test.run",
  "risk": "medium"
}
```

Action IR 的价值：

- 运行时可以检查动作是否合法。
- 桌面工作台可以展示 agent 的意图。
- Trace 可以记录结构化过程。
- Guard 可以在执行前拦截危险行为。
- action 可以通过同一协议分发给内置工具或 MCP 工具。

## 9. Tool Gateway

Tool Gateway 是所有工具的统一入口。

```text
Agent Action
    |
    v
Tool Gateway
    |
    ├── Schema Check
    ├── Effect Check
    ├── Risk Check
    ├── Permission Check
    ├── Sandbox Check
    └── Tool Execution
```

第一版内置工具：

| 工具 | 能力 | 风险 |
|---|---|---|
| `list_files` | 列出项目文件 | 低 |
| `read_file` | 读取文件内容 | 低 |
| `search_code` | 搜索代码片段 | 低 |
| `write_patch` | 生成并应用补丁 | 中 |
| `show_diff` | 查看当前修改 | 低 |
| `run_command` | 执行 shell 命令 | 高 |
| `run_test` | 执行测试命令 | 中 |

工具描述格式：

```json
{
  "name": "write_patch",
  "description": "Apply a unified diff patch inside workspace.",
  "effect": "fs.write",
  "risk": "medium",
  "approval": "required",
  "timeout_seconds": 10,
  "input_schema": {
    "patch": "string"
  }
}
```

## 10. Guard 设计

Guard 是运行时的检查系统。

| Guard | 作用 |
|---|---|
| ActionSchemaGuard | 检查模型输出是否是合法 Action IR |
| ToolArgumentGuard | 检查工具参数是否符合 schema |
| PathGuard | 禁止访问项目目录之外的路径 |
| CommandGuard | 拦截危险命令 |
| DiffGuard | 限制一次修改的文件数量和行数 |
| BudgetGuard | 限制模型调用、工具调用、执行步数 |
| CompletionGuard | 判断任务是否真的完成 |

Guard 失败后，系统不直接终止，而是把失败原因反馈给 agent：

```text
你的 action 被拒绝：命令包含高风险操作 rm -rf。
请改用更安全的方式完成任务。
```

这样 agent 可以自我修正。

## 11. Sandbox 设计

Sandbox 负责限制本地执行环境。

第一版采用轻量本地 sandbox：

```text
workspace root 固定
所有路径都做 canonicalize
禁止访问 workspace 外文件
命令执行有 timeout
命令输出有长度限制
写文件有大小限制
环境变量使用白名单
危险命令默认禁止
中高风险操作需要用户审批
```

高风险操作示例：

```text
rm -rf
sudo
chmod -R
curl | sh
git reset --hard
写入 workspace 外路径
读取 .env、ssh key、token 文件
```

Docker sandbox 作为非核心扩展保留，首版先用本地进程隔离、路径限制、命令白名单和超时控制完成闭环。

## 12. Hooks 设计

Hooks 用来扩展运行时行为。

支持的 hook 点：

| Hook 点 | 触发时机 |
|---|---|
| `before_model_call` | 调模型前 |
| `after_model_response` | 模型返回后 |
| `before_tool_call` | 工具执行前 |
| `after_tool_result` | 工具执行后 |
| `on_guard_fail` | Guard 拒绝动作时 |
| `on_context_compact` | 上下文压缩时 |
| `on_memory_write` | 写入记忆时 |
| `on_run_finish` | 任务结束时 |

第一版实现几个内置 hook：

```text
TraceHook          记录事件
BudgetHook         更新预算
SecretRedactHook   调模型前脱敏
ReportHook         结束时生成报告
```

Hooks 的价值是让系统不是一个硬编码流程，而是一个可扩展 runtime。

## 13. Tracer 与 Replay

每次任务运行都会生成一个 run 目录。

```text
runs/<run_id>/
  trace.jsonl
  report.md
  diff.patch
  final_answer.md
  context-summary.md
```

trace 记录事件：

```text
run_started
context_built
model_request
model_response
action_parsed
guard_checked
permission_required
permission_decision
tool_call
tool_result
file_changed
test_result
context_compacted
memory_written
run_finished
```

Replay 功能不是重新执行任务，而是读取 trace，把历史过程重新展示出来：

```text
第 1 步：生成计划
第 2 步：读取测试文件
第 3 步：搜索目标函数
第 4 步：生成补丁
第 5 步：用户批准
第 6 步：运行测试
第 7 步：测试通过
第 8 步：生成报告
```

这是展示系统完成度的重要功能。

## 14. 记忆管理

系统设计三层记忆。

### 14.1 短期记忆

短期记忆只存在于当前 run 中。

保存：

```text
用户任务
当前计划
最近 observation
已修改文件
当前测试结果
当前预算状态
```

### 14.2 中期记忆

中期记忆绑定当前项目会话。

保存：

```text
项目技术栈
常用测试命令
最近处理过的问题
关键目录结构
当前分支信息
```

### 14.3 长期记忆

长期记忆必须用户确认后写入。

保存：

```text
用户偏好
项目约定
不要修改的路径
常用命令
业务规则
```

不会自动保存：

```text
密钥
隐私信息
完整源码
临时日志
大段模型输出
```

桌面工作台需要提供 Memory 页面，让用户查看、编辑、删除记忆。

## 15. 上下文管理与压缩

系统需要显式管理上下文，而不是无限追加历史。

Context Manager 负责选择进入 prompt 的内容：

```text
系统规则
用户任务
当前计划
激活的 skill
相关文件片段
最近工具结果
测试错误摘要
短期记忆
项目记忆
可用工具列表
```

桌面工作台展示上下文占用：

```text
System Prompt     10%
Task               5%
Plan               8%
Skills             7%
Memory            10%
File Snippets     35%
Tool Results      20%
Remaining          5%
```

支持命令：

```text
/context   查看当前上下文组成
/compact   手动压缩上下文
/memory    查看记忆
/trace     查看运行轨迹
```

自动压缩策略：

| 阈值 | 行为 |
|---|---|
| 70% | 压缩早期对话和长工具输出 |
| 85% | 只保留当前计划、关键文件、最新错误和摘要 |
| 95% | 暂停执行，请求用户确认 |

压缩时必须保留：

```text
原始任务
当前计划
已修改内容
最新错误
关键代码片段
预算状态
```

每次压缩写入 trace，方便之后回放和解释。

## 16. Skill 系统

Skill 是任务执行规范。

目录结构：

```text
.agent/
  skills/
    bugfix/
      SKILL.md
    code-review/
      SKILL.md
    test-repair/
      SKILL.md
    spec-implement/
      SKILL.md
```

每个 `SKILL.md` 描述一类任务的标准流程、注意事项和完成标准。

示例：

```markdown
# Bugfix Skill

1. 先复现错误。
2. 再定位最小相关代码。
3. 生成最小补丁。
4. 优先运行定向测试。
5. 风险较高时运行更大范围测试。
6. 最终说明根因、修改和验证结果。
```

Skill 的作用：

- 让 agent 的行为更稳定。
- 让不同任务有不同流程。
- 让用户可以扩展自己的工作规范。
- 让系统有可复用的方法沉淀。

## 17. MCP 适配

第一版以内置工具为主，同时实现一个最小可运行的 stdio MCP Adapter。这样 MCP 不是停留在概念上，而是能真实把外部工具纳入 Tool Gateway。

```text
内置工具
  |
  v
Tool Descriptor
  |
  v
Tool Gateway
  ^
  |
MCP Tool
```

MCP Adapter 负责把 MCP 工具转换成统一工具描述：

```text
name
description
input_schema
effect
risk
approval_policy
handler
```

首版只要求跑通一类 stdio MCP 工具接入：

```text
connect_mcp_server
  -> list_tools
  -> convert_to_tool_descriptor
  -> register_into_tool_gateway
  -> call_tool_through_gateway
  -> record_trace
```

MCP 工具和内置工具使用同一套 effect、risk、approval_policy 和 trace 机制。

## 18. 优化后的关键设计

这一版系统需要避免做成“模型循环调用工具”的普通 demo。真正有区分度的地方，是把 agent 的信息管理、动作管理和反馈管理做细。

### 18.1 Harness 分成三个阶段

系统运行不要写成一个大 while，而要拆成三个阶段：

```text
启动装配：build_runtime()
  加载配置、规则、技能名片、工具、MCP、hooks、guard、sandbox、memory、tracer。

循环执行：agent_loop()
  每轮构建上下文、展示工具菜单、调用模型、解析 action、检查、执行、回灌观察。

结束收尾：finalize_run()
  固化记忆、刷新 trace、生成报告、保存 diff、输出最终回答。
```

这样实现后，系统结构会更清楚，也方便 桌面工作台展示“运行前、运行中、运行后”的状态。

### 18.2 工具菜单动态生成

每轮不要把所有工具一股脑塞给模型，而是生成本轮可用工具菜单。

工具菜单由四部分组成：

```text
内置工具：文件、搜索、命令、测试、Git diff
MCP 工具：外部能力，按连接状态展示
Skill 名片：只展示名称、描述和触发场景
系统动作：compact_context、ask_user、finish、take_note
```

菜单生成规则：

```text
当前阶段是阅读代码：优先给 read_file、search_code、list_files
当前阶段是修改代码：加入 write_patch、show_diff
当前阶段是验证：加入 run_test、run_command
当前预算紧张：加入 compact_context，减少高成本工具
当前操作高风险：要求 ask_user 或审批
```

这能让模型每轮看到的是“当前该用的能力”，而不是一个巨大、混乱的工具列表。

### 18.3 Skill 渐进式披露

Skill 不应该启动时全部塞进 prompt。启动时只加载 skill 名片：

```text
name
description
when_to_use
```

只有模型选择某个 skill 时，系统才把完整 `SKILL.md` 加入上下文。

```text
第 1 轮：模型看到 bugfix skill 的简介
第 2 轮：模型决定 use_skill("bugfix")
第 3 轮：runtime 加载 bugfix/SKILL.md 全文
第 4 轮：模型按 bugfix 流程执行
```

这能节省上下文，也让 skill 系统更像一个真正的工作流扩展机制。

### 18.4 上下文工程升级

Context Manager 需要从“拼接历史”升级为“选择高价值信息”。

上下文来源：

```text
任务输入
系统规则
激活 skill
当前计划
短期记忆
项目记忆
最近 observation
相关文件片段
测试错误
当前 diff
工具菜单
```

每个上下文项都要有结构化元数据：

```json
{
  "id": "ctx-001",
  "type": "file_snippet",
  "path": "src/auth/service.py",
  "reason": "与登录失败测试相关",
  "tokens": 620,
  "priority": 0.86
}
```

上下文选择策略：

```text
1. 永远保留用户原始任务、当前计划、最新错误、当前 diff。
2. 优先选择当前任务直接引用的文件。
3. 其次选择 import 依赖文件、测试文件、同名模块。
4. 再选择相似代码片段。
5. 长工具输出必须摘要化后进入上下文。
6. 低价值历史只保留压缩摘要。
```

代码上下文可以采用 prefix / suffix / related snippets 的结构：

```text
Path Marker       当前文件路径
Language Marker   当前文件语言
Prefix            目标区域之前的代码
Target Region     需要修改的代码
Suffix            目标区域之后的代码
Related Snippets   相关测试、调用方、相似实现
```

这样 agent 修改代码时，不需要把整个仓库塞给模型，而是提供最相关的局部上下文。

### 18.5 Workspace Index 与相似片段

系统启动后应该建立轻量代码索引。

索引内容：

```text
文件路径
语言类型
文件大小
导入关系
函数 / 类名
最近修改时间
关键词 tokens
测试文件关系
```

相似片段检索可以先做简单版本：

```text
1. 根据任务关键词找到候选文件。
2. 优先选同语言文件和测试文件。
3. 用滑动窗口切分代码片段。
4. 用 token overlap 或 Jaccard 相似度排序。
5. 取 top-k 片段进入上下文。
```

桌面工作台的 Context 页面要展示为什么选中这些片段：

```text
src/auth/service.py       keyword match: login, token
tests/test_auth.py        test file match
src/auth/model.py         imported by service.py
```

这会让“上下文工程”从幕后逻辑变成可展示能力。

### 18.6 模型调用门控

模型调用是昂贵且慢的，所以系统需要判断什么时候不应该调用模型。

可以跳过模型调用的情况：

```text
用户任务为空
当前正在等待用户审批
预算已经耗尽
上一轮 prompt 完全相同且命中缓存
当前工具还在执行
用户主动取消 run
上下文超过硬限制，需要先压缩
```

实现一个 PromptCache：

```text
key = hash(system_rules + active_skill + context_items + user_task + last_observation)
value = model_response
```

桌面工作台展示：

```text
Model calls: 8
Skipped calls: 2
Cache hits: 1
Average latency: 3.2s
```

这能体现系统不是盲目反复请求模型，而是在管理模型调用。

### 18.7 反馈传感器

代码发生修改后，系统应该自动触发反馈传感器。

传感器包括：

```text
Test Sensor       运行定向测试或项目测试
Lint Sensor       运行 lint
Type Sensor       运行类型检查
Diff Sensor       检查修改范围
Secret Sensor     检查是否泄露密钥
Format Sensor     检查格式化结果
```

第一版直接实现：

```text
Test Sensor
Diff Sensor
Secret Sensor
```

反馈结果作为 observation 回灌给模型：

```text
测试失败：tests/test_auth.py::test_login_token failed
错误原因：expected 200, got 401
相关输出：...
请根据这个结果继续修复。
```

这比“修改完就结束”更像真实编程 agent。

### 18.8 失败也是上下文

工具失败、命令失败、guard 拒绝、测试失败都不能只打印到日志里，而要成为下一轮上下文的一部分。

统一 observation 格式：

```json
{
  "type": "tool_result",
  "ok": false,
  "error_type": "guard_denied",
  "message": "命令包含高风险操作",
  "suggestion": "请改用 show_diff 或 read_file 完成检查"
}
```

这让模型能基于失败结果换路径，而不是陷入重复错误。

### 18.9 子任务隔离

第一版使用逻辑子角色，不做真正多智能体并发；但可以预留 `spawn_task` 动作，用于隔离子任务。

```json
{
  "type": "spawn_task",
  "role": "Planner",
  "subtask": "只阅读 auth 模块并总结登录流程",
  "scope": {
    "allowed_tools": ["read_file", "search_code"],
    "allowed_paths": ["src/auth", "tests"],
    "max_steps": 5
  }
}
```

子任务只返回摘要，不把完整上下文带回主流程：

```text
主 agent 上下文
  -> 派发子任务
  -> 子任务独立读取文件
  -> 返回 300 字摘要
  -> 主 agent 继续执行
```

这体现 CE-Isolate：隔离探索，避免污染主上下文。

### 18.10 本地遥测与评估

系统需要记录本地指标，用来说明 agent 是否有效。

指标包括：

```text
任务完成率
测试通过率
平均模型调用次数
平均工具调用次数
平均修复轮数
上下文压缩次数
用户审批次数
补丁接受率
失败类型分布
```

这些指标只保存在本地，不上传用户代码。

桌面工作台可以在 Run Report 中展示：

```text
本次运行：
  model calls: 7
  tool calls: 14
  files changed: 2
  tests passed: 12/12
  context compacted: 1
  user approvals: 1
```

### 18.11 优化后的系统闭环

优化后的完整闭环应该是：

```text
build_runtime
  -> scan_workspace
  -> index_codebase
  -> load_rule_files
  -> register_skill_cards
  -> register_tools
  -> open_memory
  -> open_trace

agent_loop
  -> build_context
  -> rank_context_items
  -> maybe_compact
  -> build_dynamic_tool_menu
  -> maybe_skip_model_call
  -> call_model
  -> parse_action
  -> run_guards
  -> ask_approval_if_needed
  -> execute_tool
  -> run_hooks
  -> run_sensors_if_code_changed
  -> append_observation
  -> update_memory
  -> record_trace

finalize_run
  -> consolidate_memory
  -> save_diff
  -> save_report
  -> flush_trace
  -> enable_replay
```

这版闭环更完整：它不只是“LLM 调工具”，而是包含了上下文选择、模型调用门控、工具菜单、失败回灌、反馈传感器、记忆固化和轨迹回放。

### 18.12 任务模式系统

系统不应该只有一个通用模式，而应该根据任务类型切换运行策略。

第一版建议内置五种模式：

| 模式 | 目标 | 默认策略 |
|---|---|---|
| `Chat` | 解释代码、回答问题 | 只读工具，禁止写文件和命令 |
| `Bugfix` | 修复测试失败或用户描述的 bug | 允许读、搜、写 patch、跑测试 |
| `Feature` | 实现小功能 | 先计划和确认，再写 patch |
| `Review` | 审查代码风险 | 只读 + diff 分析，不主动修改 |
| `Spec` | 根据规格实现 | 读取 spec、生成任务清单、逐项验收 |

模式会影响：

```text
激活哪些 skill
开放哪些工具
是否需要审批
上下文选择策略
完成条件
默认测试命令
```

这能让系统更像一个真正产品，而不是所有任务都走同一个 prompt。

### 18.13 权限审批体验

权限管理不能只是后端拦截，还要在 桌面工作台中变成清楚的用户体验。

当 agent 请求高风险动作时，界面展示：

```text
动作类型：write_patch
影响文件：src/auth/service.py
风险等级：medium
原因：修复 token 校验逻辑
预计修改：+12 -4
需要权限：fs.write
```

用户可以选择：

```text
Approve Once      只批准这一次
Approve Pattern   本次 run 内批准同类操作
Deny              拒绝
Edit              手动修改 patch 后批准
```

这样既体现 guard/sandbox，也体现 Human-in-the-Loop。

### 18.14 撤销与回滚

编程 agent 必须能安全试错。因此系统要支持回滚。

每次写文件前保存快照：

```text
runs/<run_id>/snapshots/
  before-step-004/
  before-step-008/
```

桌面工作台提供：

```text
Undo last patch
Restore checkpoint
Discard all changes in this run
Export diff.patch
```

这会显著提升系统可信度：agent 可以大胆探索，但用户随时能撤回。

### 18.15 模型路由与小模型辅助

第一版可以只接一个主模型，但设计上应预留模型路由。

不同任务可以使用不同模型：

```text
Planner        使用主模型
CodeReader     使用便宜模型或主模型
PatchWriter    使用主模型
TestAnalyzer   使用便宜模型
Summarizer     使用便宜模型
MemoryWriter   使用便宜模型或本地模型
```

这和 cost envelope 直接相关：不是所有步骤都需要最强模型。Budget 面板可以展示不同 role 的模型调用次数和 token 占用。

### 18.16 完成条件与验收标准

agent 不能自己说“我完成了”就算完成。系统需要 Completion Guard。

不同模式的完成条件：

```text
Bugfix:
  - 至少运行一次相关测试
  - 当前失败测试通过
  - 有 diff 摘要
  - 没有触发 secret/diff 高危告警

Feature:
  - 实现用户要求的功能点
  - 有用户可读的变更说明
  - 运行相关测试或说明未运行原因

Review:
  - 输出问题列表
  - 每个问题包含文件、位置、风险等级和理由

Chat:
  - 不修改文件
  - 不执行高风险命令
```

这个机制能避免 agent 过早结束，也能让演示更可信。

### 18.17 评测基准

为了证明系统有效，应准备一个小型本地 benchmark。

目录结构：

```text
benchmarks/
  tasks.jsonl
  projects/
    py-calculator/
    js-todo/
    py-auth/
  expected/
    py-calculator.patch
    js-todo.patch
```

每条任务记录：

```json
{
  "id": "py-bug-001",
  "mode": "Bugfix",
  "project": "py-calculator",
  "task": "修复除零错误并通过测试",
  "test_command": "pytest",
  "success_condition": "all_tests_pass"
}
```

评测指标：

```text
任务成功率
测试通过率
平均模型调用次数
平均工具调用次数
平均 token 消耗
平均运行时间
平均人工审批次数
失败原因分类
```

这会让项目在汇报时不只是“展示一个 demo”，而是有一点实验味道。

### 18.18 最值得突出的新意

这个项目最有新意的地方不应写成“我做了很多功能”，而应该压成三个主张：

```text
1. Contract-first Coding Agent
   先把 agent 的行为、权限和预算编译成 contract，再执行。

2. Observable Agent Runtime
   每一步决策、工具、反馈、压缩和记忆都可观察、可审计、可回放。

3. Context-aware Repair Loop
   用 workspace index、相似片段、测试反馈和上下文压缩支撑持续修复。
```

这三点比单纯说“支持工具、记忆、MCP、桌面工作台”更有辨识度。

### 18.19 代码智能索引应做扎实

Workspace Index 不能只做文件名搜索。这个能力需要在第一版做扎实，它会显著提升 agent 的“像真的会读项目”的感觉。

建议实现三级索引：

```text
L1 文件索引
  path、language、size、mtime、是否测试文件、是否配置文件

L2 符号索引
  function、class、method、export、route、component

L3 关系索引
  import 关系、测试文件对应关系、同名文件关系、调用关键词关系
```

不同语言可以先采用务实实现：

```text
Python：用 ast 解析 function/class/import
JavaScript/TypeScript：先用正则提取 import/export/function/component
通用语言：退化为 ripgrep + 文件切片
```

索引产物：

```text
.agent/index/
  files.json
  symbols.json
  relations.json
  snippets.jsonl
```

桌面工作台可以展示：

```text
项目文件数
语言分布
测试文件数量
识别到的函数/类/组件
当前任务命中的 top 文件
```

这比简单 `grep` 更有新意，也更适合体现上下文工程。

### 18.20 补丁流水线要做成核心能力

代码修改不要直接让模型写文件，而是走 Patch Pipeline。

```text
generate_patch
  -> parse_unified_diff
  -> dry_run_apply
  -> diff_guard
  -> user_approval
  -> snapshot_before_apply
  -> apply_patch
  -> format_if_configured
  -> run_sensors
  -> update_trace
```

这样可以实现几个很实用的功能：

```text
补丁预览
补丁干跑
补丁审批
补丁回滚
补丁统计
补丁验收
```

桌面工作台中 Diff 页面不只是展示修改，还要展示：

```text
修改文件数量
新增/删除行数
风险等级
关联计划步骤
触发的测试
是否通过 dry-run
是否通过 guard
```

这个设计能把 `fs.write` 从危险动作变成可控事务。

### 18.21 Slash Commands 应作为 P1 功能

Slash command 很适合作为用户入口，而且实现成本不高。它本质上是：

```text
命令名 + 参数解析 + prompt template + 默认 mode + 默认 skill
```

建议内置：

| 命令 | 作用 | 对应模式 |
|---|---|---|
| `/fix` | 修复 bug 或测试失败 | Bugfix |
| `/test` | 运行测试并分析失败 | Bugfix |
| `/review` | 审查当前 diff 或文件 | Review |
| `/explain` | 解释文件、函数或错误 | Chat |
| `/spec` | 根据规格实现功能 | Spec |
| `/compact` | 压缩上下文 | 系统命令 |
| `/context` | 查看上下文组成 | 系统命令 |
| `/replay` | 回放某次 run | 系统命令 |

示例：

```text
/fix pytest 失败
/review src/auth/service.py
/spec docs/todo-filter.md
```

这会让系统更符合开发者使用习惯，也能把 mode、skill、context、tools 串起来。

### 18.22 项目健康扫描

用户选择项目后，系统应该先做一次 Project Scan，不要等 agent 自己慢慢探索。

扫描内容：

```text
项目语言
包管理器
启动命令
测试命令
lint 命令
格式化命令
主要目录
Git 状态
忽略目录
潜在敏感文件
```

根据扫描结果生成：

```text
.agent/project-profile.json
```

示例：

```json
{
  "languages": ["python", "typescript"],
  "package_managers": ["uv", "npm"],
  "test_commands": ["pytest", "npm test"],
  "lint_commands": ["ruff check ."],
  "entrypoints": ["backend/app/main.py", "frontend/src/main.tsx"],
  "ignore": [".git", "node_modules", "dist", ".venv"],
  "sensitive_patterns": [".env", "id_rsa", "*.pem"]
}
```

这个 profile 会进入 Context Manager、Tool Gateway 和 桌面工作台。它能让 agent 一开始就知道项目基本情况，减少无效探索。

### 18.23 验收看板

除了 trace 和 report，桌面工作台可以加一个 Acceptance Board，直接回答“这次任务到底有没有完成”。

看板内容：

```text
用户目标是否覆盖
计划步骤是否完成
是否产生代码修改
是否运行测试
测试是否通过
是否有未处理 guard 告警
是否有未审批高风险动作
是否生成最终报告
```

每项给出状态：

```text
pass / warning / fail / skipped
```

这比让 agent 自己说“已完成”可靠，也很适合 2 分钟演示。

### 18.24 更完整的 Context Pack Builder

上下文工程建议形成一个独立模块：`Context Pack Builder`。它不是简单返回 prompt 字符串，而是生成一个可解释的上下文包。

```text
ContextPack
  ├── required_items     必须保留：任务、计划、最新错误、当前 diff
  ├── selected_items     经过排序选入：文件片段、测试、符号、记忆
  ├── compressed_items   已压缩：旧 observation、旧对话、长日志
  ├── omitted_items      因预算丢弃：低相关文件、重复输出
  └── budget_report      token 占用和剩余空间
```

选择流程：

```text
collect_candidates
  -> score_by_task_relevance
  -> boost_tests_and_imports
  -> deduplicate_snippets
  -> fit_into_token_budget
  -> generate_context_pack
```

桌面工作台展示：

```text
为什么选中这个文件
为什么丢弃那个文件
哪些内容被压缩
每类上下文用了多少 token
```

这个模块是对编程 agent 最有用的产品能力之一，也最容易讲出技术含量。

### 18.25 Daemon API 边界

为了让桌面客户端、CLI 和未来 IDE 插件不割裂，需要定义清楚本地 daemon API。

核心 API：

```text
POST /projects/open          打开项目并扫描
GET  /projects/current       获取当前项目 profile
POST /runs                   创建任务
GET  /runs/{id}              查询任务状态
POST /runs/{id}/cancel       取消任务
POST /runs/{id}/approve      审批动作
POST /runs/{id}/deny         拒绝动作
GET  /runs/{id}/events       WebSocket/SSE 事件流
GET  /runs/{id}/trace        获取 trace
POST /runs/{id}/replay       回放 trace
POST /context/compact        手动压缩上下文
GET  /memory                 查看记忆
PUT  /memory/{id}            修改记忆
```

这样系统边界更清楚：桌面端和 CLI 只是调用 API，真正逻辑都在 runtime daemon 中。

### 18.26 最终功能闭环判断

从完整产品角度看，第一版应该保证下面这条链路真实可跑：

```text
打开桌面客户端
  -> 选择项目
  -> Project Scan
  -> 生成 Project Profile
  -> 用户输入 /fix
  -> 编译 AgentContract
  -> 生成 Plan
  -> Context Pack Builder 选择上下文
  -> 动态工具菜单
  -> LLM 输出 Action IR
  -> Tool Gateway + Guard 检查
  -> 读取文件 / 搜索代码
  -> 生成 patch
  -> dry-run + diff guard
  -> 用户审批
  -> snapshot
  -> apply patch
  -> run tests
  -> 测试失败则回灌 observation 继续修
  -> 测试通过
  -> Completion Guard 验收
  -> 保存 trace/report/diff
  -> 桌面端展示 Acceptance Board 和 Replay
```

这条链路完整跑通，比堆更多功能更重要。

### 18.27 安全威胁模型

系统已经有 Guard 和 Sandbox，但还需要主动说明：系统面对哪些风险，以及每类风险如何处理。否则容易被问成“模型会不会乱删文件、泄露密钥、执行危险命令”。

建议把威胁模型定义为四类：

```text
Prompt Injection
  项目文件、README、日志或网页内容诱导模型忽略规则、泄露密钥、执行危险动作。

Workspace Escape
  agent 尝试读取或修改项目目录之外的文件。

Secret Leakage
  agent 把 .env、token、ssh key、证书内容放入 prompt、trace 或外部工具调用。

Unsafe Execution
  agent 执行删除文件、安装依赖、网络访问、后台进程、系统级修改等高风险命令。
```

对应防护：

| 风险 | 防护机制 |
|---|---|
| Prompt Injection | 把项目内容标记为 untrusted context；系统规则和 AgentContract 优先级高于文件内容 |
| Workspace Escape | PathGuard 限制所有文件工具只能访问 workspace root |
| Secret Leakage | Secret Sensor 在进入 prompt、trace、report 前做扫描和脱敏 |
| Unsafe Execution | CommandGuard + 用户审批 + timeout + 工作目录限制 |
| Tool Abuse | Tool Gateway 检查 effect、schema、risk 和 budget |
| Trace 泄露 | trace 默认本地保存，敏感字段 redaction 后再落盘 |

这部分能让系统的 AgentOS 味道更强：不是相信模型，而是默认模型输出需要被治理。

### 18.28 Run 状态机

目前有 RunState，但还可以把状态迁移写得更清楚。一个 coding agent run 至少应该支持这些状态：

```text
created
  -> scanning
  -> planning
  -> running
  -> waiting_approval
  -> applying_patch
  -> testing
  -> repairing
  -> completed

任意运行态都可能进入：
  -> paused
  -> cancelled
  -> failed
```

状态迁移规则：

| 当前状态 | 触发事件 | 下一个状态 |
|---|---|---|
| `created` | 用户提交任务 | `scanning` |
| `scanning` | Project Scan 完成 | `planning` |
| `planning` | plan 生成成功 | `running` |
| `running` | action 需要审批 | `waiting_approval` |
| `waiting_approval` | 用户批准 | `applying_patch` 或 `running` |
| `waiting_approval` | 用户拒绝 | `repairing` |
| `applying_patch` | patch 应用成功 | `testing` |
| `testing` | 测试失败 | `repairing` |
| `testing` | 测试通过 | `completed` |
| `repairing` | 新观察进入上下文 | `running` |

这个状态机要进入桌面端展示，也要进入 trace。这样用户看到的不只是“agent 正在想”，而是知道它处于哪个可管理阶段。

### 18.29 人机协同策略矩阵

系统不应该所有动作都弹窗，也不应该所有动作都自动执行。建议定义一张审批策略矩阵：

| 动作 | 默认策略 | 原因 |
|---|---|---|
| `read_file` | auto | 只读、低风险 |
| `search_code` | auto | 只读、低风险 |
| `list_files` | auto | 只读、低风险 |
| `write_patch` | approval_required | 会修改代码 |
| `apply_patch` | approval_required | 会落盘 |
| `run_test` | auto | 可控命令，来自 project profile |
| `run_lint` | auto | 可控命令，来自 project profile |
| `run_command` | approval_required | 通用 shell 风险高 |
| `install_dependency` | approval_required | 改变依赖和环境 |
| `mcp_call` | depends_on_effect | 根据工具 effect 决定 |
| `write_memory` | confirm_if_long_term | 长期记忆需要用户确认 |

审批界面不要只显示“允许 / 拒绝”，还要显示：

```text
agent 想做什么
为什么要做
将影响哪些文件或命令
风险等级
本次批准还是永久批准同类规则
拒绝后给 agent 的反馈
```

这样系统会更像一个可控的开发助手，而不是自动化脚本。

### 18.30 持久化与数据边界

第一版可以不用复杂数据库，但需要明确哪些数据放 SQLite，哪些放 JSONL，哪些放 workspace 文件。

推荐划分：

```text
SQLite
  projects
  runs
  approvals
  memories
  tool_registry
  checkpoints

JSONL
  trace.jsonl
  model_calls.jsonl
  tool_calls.jsonl

Workspace Files
  .agent/config.yaml
  .agent/project-profile.json
  .agent/index/*.json
  .agent/skills/*/SKILL.md
  openspec/*
  runs/{run_id}/report.md
  runs/{run_id}/patch.diff
```

数据边界：

```text
用户代码不上传；
trace 默认保存在本地；
模型请求前做上下文选择和密钥脱敏；
长期记忆写入前需要可见、可编辑、可删除；
benchmark 使用 examples 目录里的样例项目，不使用用户真实项目。
```

这能回答导师可能会问的隐私、安全和工程落地问题。

### 18.31 评测消融实验

Benchmark 不只测“能不能完成”，还应该证明系统设计里的关键模块是有价值的。

建议做三个对比：

```text
Baseline A：普通 LLM + 直接工具调用
Baseline B：加入 Action IR + Guard
Full System：Action IR + Guard + Context Pack + Patch Pipeline + Trace
```

对比指标：

| 指标 | 说明 |
|---|---|
| Success Rate | 任务最终是否完成 |
| Test Pass Rate | 测试是否通过 |
| Patch Acceptance Rate | 用户是否接受 patch |
| Model Calls | 模型调用次数 |
| Tool Calls | 工具调用次数 |
| Context Tokens | 上下文 token 消耗 |
| Guard Blocks | 拦截了多少风险动作 |
| Repair Turns | 测试失败后修复轮数 |
| Time To Complete | 完成耗时 |

可以设计一个简单结论：

```text
加入 Context Pack 后，平均模型调用次数下降；
加入 Patch Pipeline 后，错误修改更容易被拦截；
加入 Guard 后，高风险命令不会直接执行；
加入 Trace 后，失败原因可以被回放定位。
```

这会让项目更有研究表达，不只是产品演示。

### 18.32 最终汇报叙事

汇报时不要按“我做了哪些功能”讲，而应该按问题驱动讲：

```text
问题一：编程 agent 能改代码，但行为不可控。
解决：AgentContract + Action IR + Guard + Sandbox。

问题二：编程 agent 经常上下文混乱。
解决：Workspace Index + Context Pack Builder + /compact。

问题三：编程 agent 的过程不可解释。
解决：Trace + Replay + Acceptance Board。

问题四：编程 agent 很难沉淀为平台能力。
解决：AgentPack + Tool Registry + Skill Registry + Memory Manager。

问题五：编程 agent 开发过程本身也缺规范。
解决：AGENTS.md + SKILL.md + OpenSpec 的 Spec-driven Development。
```

最终一句话：

```text
MiniAgentOS Coder 把 coding agent 从“会调用工具的模型”提升为“受契约约束、受平台管理、可观察可回放的本地智能体运行时”。
```

## 19. AgentPack 与配置化运行

为了更好体现平台化能力，系统不应该只支持“打开一个目录然后聊天”，而应该把一个可运行的 coding agent 包装成 `AgentPack`。

### 19.1 AgentPack 结构

```text
.agent/
  config.yaml
  skills/
    bugfix/SKILL.md
    code-review/SKILL.md
    test-repair/SKILL.md
  prompts/
    plan.md
    repair.md
    review.md
  policies/
    tools.yaml
    sandbox.yaml
    budget.yaml
```

其中 `config.yaml` 是入口：

```yaml
agent:
  id: miniagent-coder
  name: MiniAgentOS Coder
  mode: orchestrator

model:
  provider: openai-compatible
  model: qwen-plus
  temperature: 0.2

runtime:
  max_steps: 20
  max_model_calls: 20
  max_tool_calls: 60
  context_limit_tokens: 120000

permissions:
  read_file: auto
  search_code: auto
  write_patch: approval_required
  run_test: auto
  run_command: approval_required

skills:
  default:
    - bugfix
    - test-repair
    - code-review
```

### 19.2 从配置到运行时

任务启动时，系统执行：

```text
load_config
  -> validate_config
  -> compile_agent_contract
  -> register_tools
  -> register_skill_cards
  -> create_run
  -> start_agent_loop
```

这条链路体现了平台能力：

```text
配置不是静态文件，而是会编译成 AgentContract；
AgentContract 不是说明文字，而是会约束每一次 action；
每一次 run 都能追溯到对应 config 版本。
```

### 19.3 Run 生命周期

Run Manager 维护任务状态：

```text
created
running
waiting_approval
compacting_context
testing
completed
failed
cancelled
```

每个 run 都保存：

```text
输入任务
使用的 config 版本
编译出的 AgentContract
执行 trace
上下文摘要
内存快照
文件 diff
测试结果
最终报告
```

这些记录直接支撑：

```text
查看历史任务
比较不同 run 的表现
回放某次执行
从 checkpoint 恢复
导出报告
```

### 19.4 Checkpoint 与恢复

长任务不应该因为一次中断就丢失。系统应支持 checkpoint：

```text
runs/<run_id>/checkpoints/
  step-005.json
  step-010.json
  before-approval.json
```

checkpoint 内容：

```json
{
  "run_id": "2026-08-27-001",
  "step": 10,
  "status": "waiting_approval",
  "plan": [],
  "context_summary": "...",
  "memory_snapshot": {},
  "changed_files": ["src/auth/service.py"],
  "trace_offset": 42
}
```

恢复时不重新开始，而是：

```text
load_checkpoint
  -> restore_run_state
  -> rebuild_context_from_summary
  -> continue_agent_loop
```

这个能力能明显增强系统完整性，也更贴近真正的 AgentOS runtime。

## 20. 规范驱动开发

MiniAgentOS Coder 不只要管理 agent 的运行，也要管理 agent 如何开发代码。这里引入三类规范文件：

```text
AGENTS.md      项目级行为规范
SKILL.md       任务级执行规范
openspec/      需求、设计、变更和验收规范
```

它们分别回答三个问题：

| 文件 | 解决的问题 | 进入系统的位置 |
|---|---|---|
| `AGENTS.md` | 在这个仓库里，agent 必须遵守哪些全局规则 | Project Scan 后加载为项目规则 |
| `SKILL.md` | 做某类任务时，agent 应该按什么流程执行 | Skill Registry 只加载名片，命中后渐进式披露全文 |
| `openspec/` | 某个功能为什么做、怎么设计、怎样算完成 | Spec 模式读取，并驱动计划、实现和验收 |

### 20.1 AGENTS.md

`AGENTS.md` 是项目级约束，适合写稳定规则：

```markdown
# AGENTS.md

## Project Rules

- Do not modify files outside the workspace.
- Prefer minimal patches.
- Run tests before finishing bugfix tasks.
- Do not edit generated files.
- Ask for approval before changing dependencies.

## Commands

- Test: pytest
- Lint: ruff check .
- Format: ruff format .
```

系统启动时读取 `AGENTS.md`，转成 `ProjectRules`，进入 Context Manager 和 AgentContract：

```text
AGENTS.md
  -> ProjectRules
  -> AgentContract.policies
  -> ContextPack.required_items
```

### 20.2 SKILL.md

`SKILL.md` 是任务级流程规范。它不描述项目全局规则，而描述某类任务应该怎么做。

建议内置：

```text
.agent/skills/
  bugfix/SKILL.md
  feature/SKILL.md
  code-review/SKILL.md
  test-repair/SKILL.md
  spec-implement/SKILL.md
```

例如 `spec-implement/SKILL.md`：

```markdown
# Spec Implement Skill

1. Read the active OpenSpec change.
2. Convert requirements into a plan.
3. Implement one requirement at a time.
4. After each patch, run related tests.
5. Update the acceptance checklist.
6. Finish only when every MUST requirement is satisfied.
```

Skill 的加载方式：

```text
启动时：只加载 skill name / description / when_to_use
命中后：读取完整 SKILL.md
执行中：作为当前 mode 的流程约束进入 prompt
```

### 20.3 OpenSpec 目录

`openspec/` 用来管理需求、设计、变更和验收。

推荐目录：

```text
openspec/
  project.md
  specs/
    agent-runtime/spec.md
    tool-gateway/spec.md
    context-manager/spec.md
    desktop-workbench/spec.md
  changes/
    add-patch-pipeline/
      proposal.md
      design.md
      tasks.md
      specs/
        patch-pipeline/spec.md
```

`changes/*/tasks.md` 描述当前变更任务：

```markdown
# Tasks

- [ ] Define PatchAction schema
- [ ] Implement dry-run patch parser
- [ ] Add DiffGuard
- [ ] Add approval UI
- [ ] Add rollback snapshot
- [ ] Add tests
```

### 20.4 Spec 模式执行流程

当用户输入：

```text
/spec add-patch-pipeline
```

系统执行：

```text
读取 openspec/changes/add-patch-pipeline/proposal.md
读取 design.md
读取 tasks.md
读取相关 specs
生成实施计划
逐项修改代码
运行测试
更新验收看板
生成 spec 实现报告
```

Spec 模式下，Completion Guard 不能只看测试是否通过，还要检查：

```text
tasks.md 是否全部完成
MUST requirement 是否覆盖
相关测试是否运行
是否有未审批风险
是否生成变更报告
```

### 20.5 双层规范

这个设计形成双层规范：

```text
开发时：Spec-driven Development
  AGENTS.md / SKILL.md / openspec 约束 agent 如何写代码

运行时：Contract-driven Execution
  AgentContract / Effect / Guard / Sandbox / Budget 约束 agent 如何执行动作
```

二者关系：

```text
openspec 说明“要做什么”
SKILL.md 说明“应该怎么做”
AGENTS.md 说明“在这个项目里不能破坏什么”
AgentContract 说明“运行时允许做什么”
Completion Guard 判断“是否真的完成”
```

这会让项目更有特色：它不是一个自由发挥的 coding agent，而是一个规范驱动、契约执行、可审计回放的编程智能体系统。

## 21. 桌面工作台设计

桌面客户端第一屏就是工作台。它不是浏览器里的临时页面，而是一个类似编程 agent 控制台的产品。

```text
┌──────────────────────────────────────────────────────┐
│ Top Bar: Project / Mode / Model / Budget / Run Status│
├───────────────┬──────────────────────┬───────────────┤
│ Left Panel    │ Center Panel          │ Right Panel   │
│ Files         │ Chat                  │ Plan          │
│ Search        │ Tool Observations     │ Tools         │
│ Diff          │ Approvals             │ Context       │
│ Tests         │ Final Answer          │ Memory        │
│               │                       │ Contract      │
│               │                       │ Trace         │
└───────────────┴──────────────────────┴───────────────┘
```

主要页面：

| 页面 | 内容 |
|---|---|
| Chat | 用户输入任务，agent 返回过程和结果 |
| Plan | 展示任务拆解、当前步骤、每步状态 |
| Tools | 展示工具、风险、权限策略、调用次数 |
| Diff | 展示代码修改，支持批准或拒绝 |
| Tests | 展示测试命令、输出、失败原因 |
| Context | 展示 token 占用和上下文来源 |
| Memory | 管理短期、中期、长期记忆 |
| Contract | 展示当前 AgentContract、effect 权限和 cost envelope |
| Budget | 展示模型调用、工具调用、token、运行时间占用 |
| Checkpoints | 展示自动保存点，支持从某一步恢复 |
| Evaluation | 展示 benchmark 结果和本地运行指标 |
| Trace | 展示事件时间线和 replay |
| Settings | 配置模型、预算、sandbox 和审批规则 |

桌面工作台的重点不是好看，而是把 agent 的内部状态讲清楚。

汇报演示时，右侧面板建议默认展示三张卡：

```text
Plan Card       现在执行到哪一步
Contract Card   当前允许哪些 effect、剩余多少 budget
Trace Card      最近一次模型决策、工具执行和反馈结果
```

这样导师能直接看到：这个系统不是一个聊天界面，而是一个有运行时管理能力的 agent workbench。

### 21.1 为什么不是割裂的桌面端和 CLI

系统不是两套入口，而是一套 runtime、多种外壳：

```text
Local Runtime Daemon
  ├── 桌面工作台调用
  └── CLI Companion 调用
```

桌面工作台负责主要用户体验，CLI 负责脚本化和快速操作。二者共享：

```text
同一个 workspace
同一个 AgentContract
同一个 Tool Gateway
同一个 Memory Store
同一个 Trace Store
同一个 Run Manager
```

所以它不是割裂的“网页 + 命令行”，而是一个本地 agent 产品的两种控制方式。

### 21.2 开发形态与交付形态

开发阶段：

```text
frontend: npm run dev
backend: uvicorn app.main:app --reload
```

交付阶段：

```text
Desktop App 启动
  -> 自动拉起 Local Runtime Daemon
  -> 加载 React Workbench
  -> 用户在桌面客户端中操作
```

推荐实现路线：

```text
第一阶段：React + Vite + FastAPI，先把功能跑通。
第二阶段：用 Electron 包一层桌面壳，启动本地 FastAPI daemon。
第三阶段：CLI 通过 HTTP 调同一个 daemon。
```

Electron 虽然包体更大，但对短期项目最稳：前端还是熟悉的 Vite，后端还是 Python，桌面壳只负责启动进程、选择目录和承载页面。Tauri 更轻，但会引入 Rust 和 sidecar 打包复杂度，因此不作为首版主路线。

## 22. 数据结构

### 22.1 RunState

```json
{
  "run_id": "2026-08-27-001",
  "task": "修复登录接口测试失败",
  "status": "running",
  "plan": [],
  "current_step": 2,
  "changed_files": [],
  "test_status": "failed",
  "budget": {},
  "memory_refs": [],
  "last_observation": {}
}
```

### 22.2 TraceEvent

```json
{
  "time": "2026-08-27T22:30:00+08:00",
  "run_id": "2026-08-27-001",
  "event": "tool_call",
  "role": "CodeReader",
  "payload": {
    "tool": "read_file",
    "path": "src/auth/service.py"
  }
}
```

### 22.3 ToolDescriptor

```json
{
  "name": "run_test",
  "effect": "test.run",
  "risk": "medium",
  "approval": "auto",
  "timeout_seconds": 30,
  "input_schema": {
    "command": "string"
  }
}
```

### 22.4 ContextItem

```json
{
  "id": "ctx-001",
  "type": "file_snippet",
  "path": "src/auth/service.py",
  "reason": "与登录失败测试相关",
  "tokens": 620,
  "priority": 0.86,
  "content": "..."
}
```

### 22.5 Observation

```json
{
  "type": "test_result",
  "ok": false,
  "summary": "1 failed, 11 passed",
  "message": "expected 200, got 401",
  "next_hint": "检查 token 校验逻辑"
}
```

### 22.6 AgentContract

```json
{
  "agent_id": "miniagent-coder",
  "config_version": "v1",
  "program": {
    "mode": "orchestrator",
    "roles": ["Planner", "CodeReader", "PatchWriter", "TestRunner", "Reviewer"]
  },
  "effects": {
    "allow": ["fs.read", "fs.write", "shell.exec", "test.run", "state.memory"],
    "deny": ["workspace.escape", "secret.read"]
  },
  "cost_envelope": {
    "max_steps": 20,
    "max_model_calls": 20,
    "max_tool_calls": 60,
    "max_wall_time_seconds": 600
  },
  "policies": {
    "write_patch": "approval_required",
    "run_command": "approval_required"
  }
}
```

### 22.7 Checkpoint

```json
{
  "checkpoint_id": "ckpt-step-010",
  "run_id": "2026-08-27-001",
  "step": 10,
  "status": "waiting_approval",
  "run_state": {},
  "context_summary": "...",
  "memory_snapshot": {},
  "changed_files": [],
  "trace_offset": 42
}
```

### 22.8 ApprovalRequest

```json
{
  "approval_id": "appr-001",
  "run_id": "2026-08-27-001",
  "action_id": "act-008",
  "risk": "medium",
  "effect": "fs.write",
  "reason": "需要应用补丁修复登录测试失败",
  "target": {
    "type": "patch",
    "files": ["src/auth/service.py"]
  },
  "options": ["approve_once", "approve_pattern", "deny", "edit"]
}
```

### 22.9 RunStatus

```json
{
  "run_id": "2026-08-27-001",
  "status": "waiting_approval",
  "phase": "applying_patch",
  "current_action": "write_patch",
  "waiting_on": "user",
  "can_resume": true,
  "can_replay": true,
  "last_checkpoint_id": "ckpt-step-010"
}
```

### 22.10 ContextPack

```json
{
  "run_id": "2026-08-27-001",
  "required_items": ["user_task", "current_plan", "latest_error"],
  "selected_items": ["ctx-001", "ctx-002"],
  "compressed_items": ["ctx-old-logs"],
  "omitted_items": ["ctx-low-priority"],
  "budget_report": {
    "max_tokens": 32000,
    "used_tokens": 18400,
    "remaining_tokens": 13600
  }
}
```

## 23. 技术选型

建议技术栈：

```text
Backend: Python + FastAPI
Frontend: React + Vite + TypeScript
Desktop Shell: Electron
Communication: HTTP + WebSocket
Model API: OpenAI-compatible client
Storage: SQLite + JSONL
Patch: unified diff
Test runner: subprocess
CLI: Typer
```

项目目录：

```text
miniagent-coder/
  AGENTS.md
  desktop/
    electron/
  backend/
    app/
      agent/
      runtime/
      tools/
      guards/
      hooks/
      sandbox/
      memory/
      context/
      mcp/
      api/
  frontend/
    src/
      pages/
      components/
      stores/
  .agent/
    skills/
    prompts/
  openspec/
    project.md
    specs/
    changes/
  examples/
    python-bugfix/
    js-test-repair/
  runs/
  README.txt
```

## 24. 实现优先级

### P0：基础闭环

必须先完成：

```text
桌面工作台任务输入
模型调用
Agent 主循环
Action IR 解析
文件读取
代码搜索
Workspace Index
Project Scan
补丁生成
Patch Pipeline
Diff 展示
命令执行
测试运行
基础 Guard
基础 Context Manager
Test Sensor
AgentContract 生成与检查
任务模式系统
基础权限审批
Daemon API
AGENTS.md 加载
trace.jsonl
Run 状态机
Secret Sensor
最终报告
```

P0 完成后，系统已经可以演示“agent 自动修 bug”。

### P1：系统特色

继续完成：

```text
Tools 管理页面
Hooks 机制
Sandbox 策略
Memory 面板
Context 面板
/compact 命令
Context Pack Builder 可解释面板
动态工具菜单
Skill 渐进式披露
PromptCache
AgentPack 配置
Run Manager
Checkpoint 保存
权限审批体验
审批策略矩阵
撤销与回滚
Completion Guard
Diff 审批
Trace Replay
Skill 加载
Slash Commands
验收看板
OpenSpec 目录与 Spec 模式
spec-implement skill
最小 MCP Adapter
Checkpoint 恢复
本地 telemetry
小型 benchmark
消融评测报告
```

P1 完成后，系统从普通 demo 变成有架构亮点的 runtime。

### P2：非核心扩展

```text
CLI Companion
Docker sandbox
spawn_task 子任务隔离
Agent 版本管理
模型路由
批量评测报告
```

P2 不影响首版闭环。汇报时重点讲 P0 和 P1，P2 只作为系统边界和延展方向。

## 25. 演示场景

准备两个演示项目。

### 25.1 Python Bugfix

```text
任务：修复 calculator.py 中的边界条件错误。
过程：读取测试 -> 定位函数 -> 生成补丁 -> 用户批准 -> 运行 pytest -> 测试通过 -> 生成报告。
展示点：Plan、Action IR、Tool Gateway、Diff、Test、Trace。
```

### 25.2 前端功能补全

```text
任务：给 Todo 页面增加筛选功能。
过程：扫描组件 -> 阅读状态逻辑 -> 修改 UI -> 运行测试 -> 展示结果。
展示点：上下文选择、文件修改、测试执行、Memory、Context 面板。
```

## 26. 项目亮点

这个系统的亮点可以概括为八个。

### 26.1 可控

模型的每一步动作都要经过 Action IR、Tool Gateway、Guard 和 Sandbox。

### 26.2 可见

用户可以在 桌面工作台中看到计划、工具、上下文、记忆、diff、测试和 trace。

### 26.3 可审计

每个 run 都生成 `trace.jsonl` 和 `report.md`，可以追踪 agent 做过什么。

### 26.4 可回放

Replay 可以复现一次任务的完整过程，方便展示和调试。

### 26.5 可压缩

系统管理上下文占用，支持自动压缩和手动 `/compact`。

### 26.6 可沉淀

Memory 和 Skill 让项目经验、用户偏好、任务流程可以逐渐积累。

### 26.7 Contract-first

每次 run 先编译 `AgentContract`，再执行 agent。权限、effect、预算和审批策略都不是口头约束，而是运行时检查对象。

### 26.8 可评测

系统提供本地 benchmark，能够统计任务成功率、测试通过率、模型调用次数、工具调用次数、token 消耗和失败类型。

### 26.9 有产品闭环

系统不是只在终端输出结果，而是形成完整工作台：任务输入、计划跟踪、上下文解释、补丁审批、测试反馈、验收看板和历史回放。

### 26.10 有研究表达

系统可以用三个关键词汇报：

```text
Contract-first：运行前先生成 agent 契约。
Context-aware：运行中动态选择和压缩上下文。
Traceable：运行后可审计、可回放、可评测。
```

这让项目同时具备工程完成度和研究表达，不只是功能拼装。

### 26.11 规范驱动

系统同时具备 `Spec-driven Development` 和 `Contract-driven Execution`：开发过程由 OpenSpec、AGENTS.md、SKILL.md 约束，运行过程由 AgentContract、Guard、Sandbox、Budget 约束。

## 27. 最终交付内容

最终提交应该包括：

```text
1. 一个公开 Git 仓库
2. 可运行的 桌面工作台+ 后端 Runtime
3. 至少两个 example 项目
4. README.txt
5. 2 分钟以内演示视频
```

演示视频建议顺序：

```text
1. 打开 桌面工作台，选择项目。
2. 输入 bugfix 任务。
3. 展示 agent 生成 plan。
4. 展示 agent 读取文件和搜索代码。
5. 展示 diff 审批。
6. 展示运行测试。
7. 展示 trace replay。
8. 展示最终报告。
```

## 28. 总结

MiniAgentOS Coder 要做的是一个小而完整的编程智能体系统。

它的主线非常清楚：

```text
用户提出任务
  -> agent 规划
  -> runtime 构建上下文
  -> 模型输出结构化 action
  -> guard 检查
  -> tool gateway 执行
  -> sandbox 限制风险
  -> trace 记录过程
  -> memory 沉淀经验
  -> context manager 控制上下文
  -> 桌面工作台展示和审批
  -> 测试通过后生成报告
```

这个项目的价值不在于堆功能，而在于把编程 agent 的关键系统问题串成一个闭环：任务规划、工具执行、安全控制、上下文管理、记忆管理、过程可视化和结果验证。
