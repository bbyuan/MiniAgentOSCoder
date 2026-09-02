# MiniAgentOS Coder Agent 架构完备性演示文档

## 1. 演示定位

MiniAgentOS Coder 不只是一个代码聊天界面，而是一个本地编程 Agent 运行时。它把模型的自然语言输出，转换成受契约、上下文、工具网关、审批、Sandbox、验证、记忆和 Trace 管理的完整工程流程。

建议开场用这句话：

```text
MiniAgentOS Coder 的目标，是让 Coding Agent 从“能改代码”升级成“可约束、可观察、可审批、可回放、可复用”的本地运行系统。
```

## 2. 系统整体结构

演示时先交代四层结构：

| 层级 | 作用 | 展示点 |
| --- | --- | --- |
| Workbench 前端 | 用户发起任务、查看运行、审批变更、打开项目文件 | 任务输入、运行过程、项目文件、变更审阅、运行详情 |
| Daemon 后端 | 负责编排 Agent Run，并把所有动作变成事件和证据 | Run API、AgentLoop、Trace、Report、History |
| Agent Runtime | 把任务编译为契约，构建上下文，驱动模型和工具 | AgentContract、Context Pack、Action IR、Completion Guard |
| Governed Extensions | 在安全边界内接入扩展能力 | Skills、MCP、Hooks、Memory、Sandbox、Tool Policy |

一句话讲清数据流：

```text
用户任务 -> AgentContract -> Context Pack -> Prompt Layers -> Model Action IR
-> Tool Gateway -> Guard/Sandbox/Approval -> Patch/Test -> Evidence/Memory/Report/Replay
```

新增的形式化视角可以这样讲：

```text
AgentContract + Skill/MCP/Hook + Governance
-> Formal Agent Program
-> term / effect / grade / semantic lint
-> Trace rules
```

它把 Coder Agent 投影成一个接近 AgentOS formal representation 与 `λA` typed lambda calculus 的程序表示：`fix_n` 表示有界 ReAct 循环，`lam` 表示 LLM oracle call，`case ActionIR.type` 表示模型输出后的动作分派，`tool[f]` 表示外部函数调用，`guard` 表示工具调用必须先过策略和沙箱，`mem` 表示项目/长期记忆参与环境。前端“运行画像”中的“形式化程序”卡片和运行详情里的 Agent Program 页，就是这套后端编译结果的可视化证据。

实现锚点可以这样讲：

| 能力 | 代码位置 | 说明 |
| --- | --- | --- |
| Run 编排 | `backend/app/runtime/run_worker.py`、`backend/app/runtime/agent_loop.py` | 调度模型、工具、审批、验证和终态处理 |
| 契约模型 | `backend/app/models/contract.py` | 定义 effect、预算、工具策略和完成约束 |
| 形式化投影 | `backend/app/runtime/formal_program.py`、`backend/app/models/formal_program.py` | 把运行时契约编译成 DSL term、effect、grade 和 semantic lint |
| 上下文工程 | `backend/app/context/pack_builder.py`、`backend/app/context/compactor.py` | 构建、解释、刷新和压缩 Context Pack |
| 记忆管理 | `backend/app/context/memory_store.py`、`backend/app/api/memory.py` | 管理运行记忆、项目记忆和长期记忆 |
| Trace 与回放 | `backend/app/runtime/tracer.py`、`backend/app/api/trace.py` | 写入事件流，并向前端提供回放快照 |
| 扩展能力 | `backend/app/runtime/mcp.py`、`backend/app/runtime/hooks.py`、`backend/app/api/extensions.py` | 管理 Skill、MCP、Hook 的加载、执行和证据 |
| 前端呈现 | `frontend/src/pages/Workbench.tsx`、`frontend/src/components/*Panel.tsx` | 把运行证据、配置、文件、diff 和审批可视化 |

## 3. 从 Agent 角度说明完备性

### 3.1 提示词工程

系统不是把用户输入直接发给模型，而是分层组装 Prompt：

- System 层：运行时身份、工具契约、安全边界、输出格式。
- Project 层：`AGENTS.md`、OpenSpec、项目约定、测试命令。
- Skill 层：按模式和任务选择 `SKILL.md`，只在需要时加载完整说明。
- Context 层：相关文件、片段、当前 diff、测试失败信息。
- Memory 层：本轮、项目、长期记忆，按作用域注入。
- User 层：本次任务和运行中追加指令。

演示重点：

```text
Prompt 不是一段固定模板，而是由运行时按任务、预算、权限和证据动态编排。
```

### 3.2 上下文工程

Context Pack 解决“给模型看什么”的问题：

- 扫描工作区并识别项目规则、测试入口和关键文件。
- 根据任务模式选择文件和片段，而不是把整个仓库塞给模型。
- 记录上下文来源、Token 占比、保留/压缩/省略决策。
- 在长任务中支持压缩和 checkpoint，避免上下文漂移。

演示重点：

```text
上下文是可解释的运行资源，用户能看到模型为什么读了这些文件。
```

### 3.3 Harness 与工具治理

模型不能直接操作系统。它只能输出结构化 Action IR，再由运行时决定是否执行：

```text
Action IR -> Tool Registry -> Policy Evaluation -> Guard -> Sandbox -> Observation
```

这条链路带来三类能力：

- 可控：每个工具有 effect、风险等级、审批策略和预算。
- 可审计：读文件、写文件、运行命令、补丁、测试都会进入 Trace。
- 可恢复：失败时保留 observation、checkpoint、report 和下一步建议。

演示重点：

```text
真正执行命令的是运行时 Harness，不是模型本身。
```

### 3.4 多智能体协作

系统已经具备多角色协作的形态：

- Planner：决定下一步要读文件、修改、验证还是总结。
- Worker：执行具体代码修改或命令动作。
- Reviewer：审查补丁、风险和是否符合任务目标。
- Verifier：确认测试、变更证据和完成条件。

演示重点：

```text
这不是单轮问答，而是多个职责角色围绕同一份 AgentContract 产生可追踪证据。
```

### 3.5 Skill、MCP 与 Hooks

扩展能力不是散落在系统外部，而是纳入同一套运行时治理：

- Skills：让 Agent 获得项目特定方法论，例如发票税务规则。
- MCP：接入外部工具，但发现出来的工具仍然走 Tool Gateway。
- Hooks：在 run.before、tool.after 等生命周期点执行项目脚本。

演示重点：

```text
扩展不会绕过安全策略，所有能力都进入统一的审批、Sandbox 和 Trace。
```

### 3.6 记忆管理

记忆不是简单保存聊天记录，而是分作用域管理：

- Run memory：只服务当前运行。
- Project memory：记录项目偏好、命令和常见坑点。
- Long-term memory：需要显式确认才进入长期复用。

演示重点：

```text
记忆是可见、可编辑、可拒绝的，不是黑盒学习。
```

### 3.7 证据化完成

Completion Guard 防止模型只靠一句“完成了”结束任务。不同模式有不同完成条件：

- Bugfix/Feature/Spec：需要变更文件、补丁记录、验证命令或测试证据。
- Review：必须保持只读，并输出审查发现。
- Explain/Chat：需要解释结果，不要求修改。

演示重点：

```text
系统判断完成，依据的是运行证据，而不是模型自我声明。
```

### 3.8 形式化程序表示

为了让 AgentOS formal representation 和 `λA` typed lambda calculus 的思想不是只停留在介绍里，系统现在会在准备运行时生成 Formal Agent Program：

- Term：展示 `mem(guard(fix_n(... case ActionIR.type ...)))` 的程序骨架。
- DSL：展示并可复制本次运行的 `MiniAgentCoderProgram`，把 AgentContract、`λA` term、Effect、Grade、Guard、Memory 和 Restrict 统一为可导出的 IR。
- Effect：展示本次 Agent 可触达的 `fs.read/fs.write/shell.exec/test.run/state.memory/mcp.call` 等副作用边界。
- Grade：展示步骤、模型调用、工具调用、Token 和最长运行时间上限。
- Skill / Restrict：展示项目规则如何作为能力注入，沙箱和工具策略如何作为运行上界。
- Semantic lint：检查有界循环、写文件审批、命令审批、工作区逃逸禁止、Secret 读取禁止、扩展引用可解析等条件。
- Trace rules：说明哪些运行事件对应 `C-LLM`、`C-Route`、`C-Tool`、`C-Guard`、`C-Mem`，回放时会把事件标注为对应的小步语义规则。

演示重点：

```text
这不是把论文概念贴到界面上，而是后端真的把当前 Coder Agent 编译成一个可检查、可展示、可追踪的程序表示。
```

## 4. 视频中的可展示内容

为了让评委看到后端实现，不要只停留在任务输入框。建议至少展示这些区域：

| 展示区域 | 评委能看到什么 | 对应后端实现 |
| --- | --- | --- |
| 运行设置 | 模型、Sandbox、工具策略、Skill/MCP/Hook 开关 | AgentContract、Policy、Extension Catalog |
| 形式化程序 | DSL term、effect、grade、语义检查、Trace 规则 | Formal Program Compiler、AgentOS / λA 投影 |
| 运行过程 | 按阶段展示模型请求、读文件、命令、审批、验证 | Trace Event、Action IR、Observation |
| 项目文件 | 工作区文件树和文件内容 | Workspace Tool、路径安全检查 |
| 变更审阅 | 修改文件、diff、接受/拒绝粒度 | Patch Pipeline、Approval Gate |
| 运行详情 | 上下文、记忆、治理、扩展、报告、回放 | Context Pack、Memory、Governance、Trace Replay |
| 历史中心 | 本地运行记录、失败原因、对比和继续 | SQLite Run Center、Checkpoint |

如果只能点开三个地方，优先展示：

1. 运行设置：证明运行前有契约、权限和扩展配置。
2. 形式化程序：证明 Agent 被编译成 term/effect/grade，而不是黑盒执行。
3. 运行过程：证明模型请求、工具动作、命令和审批都被 Trace 记录。
4. 变更文件或运行详情：证明补丁、测试、记忆和报告不是口头描述，而是后端证据。

如果时间只够展示一个例子，推荐使用：

```text
examples/skill-invoice-rules
```

它最适合展示 Agent 完备性，因为同一轮里能覆盖：

- 项目规则：`AGENTS.md`
- Domain Skill：发票规则说明
- Hook/MCP：可展示扩展目录
- Bugfix：有真实失败测试
- Patch 审批：能看到代码变更和验证

## 5. 2 分钟演示脚本

下面这版可以直接照着录，左边是屏幕操作，右边是口播内容。语速正常偏快时约 2 分钟。

| 时间 | 屏幕动作 | 你要说的话 |
| --- | --- | --- |
| 0:00 - 0:12 | 展示 README 或本文档的数据流图 | 大家好，这是 MiniAgentOS Coder。它不是一个简单的代码聊天框，而是一个本地 Coding Agent 运行时。它的核心目标，是把模型的一次代码任务，变成可约束、可观察、可审批、可验证、可回放的工程流程。 |
| 0:12 - 0:25 | 指向架构表或 Workbench 首页 | 整个系统可以分成四层：前端 Workbench 负责交互和可视化；后端 Daemon 负责编排运行；Agent Runtime 负责任务契约、上下文、工具调用和完成判断；扩展层负责 Skills、MCP、Hooks、Memory 和 Sandbox。 |
| 0:25 - 0:38 | 打开 `examples/skill-invoice-rules` | 我这里打开一个发票计算示例项目。这个例子里有项目规则、领域 Skill、可选 Hook/MCP，还有真实失败测试，所以它能比较完整地展示 Agent 的运行闭环。 |
| 0:38 - 0:52 | 打开运行设置 | 在开始前，系统会先生成运行配置。这里能看到模型、运行模式、Sandbox、工具策略，以及项目声明的 Skill、MCP 和 Hook。也就是说，Agent 并不是随意行动，而是在一个明确的 AgentContract 里工作。 |
| 0:52 - 1:08 | 启动任务，展示运行过程 | 任务启动后，系统会先收集上下文，再让模型判断下一步。这里展示的不是普通日志，而是 Agent 的工作证据：它读了哪些文件、调用了哪些工具、运行了什么命令、为什么进入下一步，都会被记录到 Trace 里。 |
| 1:08 - 1:24 | 展开运行过程中的阶段或关键动作 | 这部分体现的是上下文工程和 Harness 工程。模型只输出结构化 Action IR，真正读文件、写文件、运行命令的是后端 Tool Gateway，并且每一步都会经过策略检查、Guard 和 Sandbox。 |
| 1:24 - 1:42 | 展示变更提示，进入项目文件或 diff 视图 | 如果 Agent 准备修改代码，它不会直接静默落盘。系统会生成补丁，并把变更提示挂在对话区域附近。用户可以点进项目文件，查看具体修改前后对比，再决定接受或拒绝。 |
| 1:42 - 1:55 | 展示任务完成、验收证据、运行详情 | 完成时也不是模型说完成就结束。Completion Guard 会检查是否有变更证据、测试证据、报告和模式约束。这里还能看到上下文来源、记忆建议、扩展运行证据和最终报告。 |
| 1:55 - 2:00 | 回到整体页面或最终结果 | 所以 MiniAgentOS Coder 的亮点，是把 Coding Agent 从黑盒对话，变成了一个本地、可控、可审计、可扩展的 AgentOS 编程运行时。 |

### 0:00 - 0:20 先讲架构

```text
这是 MiniAgentOS Coder，一个本地 Coding Agent 运行时。它不是让模型直接改代码，而是把一次编程任务编译成 AgentContract，然后经过上下文构建、模型决策、工具网关、安全审批、补丁、测试和 Trace 回放，形成一个可治理的完整运行闭环。
```

屏幕展示：

- README 或本页的系统数据流。
- Workbench 首屏。

### 0:20 - 0:40 展示任务准备

```text
我打开一个发票计算示例项目。这里可以看到模型配置、运行模式、测试命令、Sandbox 权限，以及这个项目声明的 Skill、MCP 和 Hook。也就是说，Agent 在开始前已经知道任务边界、项目规则和可用能力。
```

屏幕展示：

- 选择 `examples/skill-invoice-rules`。
- 打开运行设置。
- 展示 Skill/MCP/Hook、Sandbox、工具策略。

### 0:40 - 1:10 展示 Agent 运行过程

```text
启动后，系统会先收集上下文，再让模型输出结构化动作。这里的运行过程不是普通日志，而是 Agent 的工作证据：模型何时判断下一步、读了哪些文件、运行了什么命令、是否触发审批，都按阶段记录下来。
```

屏幕展示：

- 运行过程阶段：上下文收集、代码检查、修改、验证、总结。
- 展开最近的模型请求、读文件、命令或审批事件。

### 1:10 - 1:35 展示变更与审批

```text
当 Agent 准备修改代码时，它不能直接落盘。系统会把补丁挂到对话区域上方，并联动到项目文件视图。用户可以点进文件查看修改前后对比，再选择接受或拒绝。
```

屏幕展示：

- 对话框上方的变更提示。
- 点击查看变更文件。
- 展示 diff 和接受/拒绝。

### 1:35 - 1:55 展示完成证据

```text
任务结束后，系统会用 Completion Guard 检查是否真的完成。这里能看到测试证据、变更文件、上下文来源、记忆建议、扩展运行证据和最终报告。所以评估的不是模型说了什么，而是它留下了哪些可验证证据。
```

屏幕展示：

- 任务完成区。
- 查看完整说明。
- 验收证据、Trace、Memory 或 Report。

### 1:55 - 2:00 收束

```text
总结来说，MiniAgentOS Coder 的核心价值是把 Coding Agent 从黑盒对话，变成一个本地、可控、可审计、可扩展的工程运行时。
```

## 6. 评委可能追问的回答

| 问题 | 推荐回答 |
| --- | --- |
| 这和普通代码助手有什么区别？ | 普通助手以聊天为中心；这里以受治理的 Run 为中心，每一步都有契约、策略、证据和回放。 |
| 后端实现体现在哪里？ | 前端展示的是后端产生的 AgentContract、Trace、Context Pack、Policy Evaluation、Sandbox Execution、Patch 和 Report。 |
| 模型能不能随便运行命令？ | 不能。模型只产生 Action IR，命令必须通过 Tool Gateway、Guard、Sandbox 和审批策略。 |
| 为什么需要 Skill/MCP/Hook？ | 它们让 Agent 能接入项目知识、外部工具和生命周期脚本，但仍然受统一治理。 |
| 如何避免上下文混乱？ | Context Pack 会记录来源、Token 预算和压缩决策，长任务还可以 checkpoint 和 replay。 |
| 如何证明任务真的完成？ | Completion Guard 会检查变更、测试、报告和模式约束，不靠模型自我声明。 |

## 7. 展示前准备清单

```text
# 后端
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file ../.env

# 前端
cd frontend
npm run dev -- --host 127.0.0.1
```

演示前确认：

- 根目录 `.env` 里模型 Key 可用。
- 历史记录已清空，避免干扰。
- `examples/skill-invoice-rules` 保持待修复状态。
- 能打开项目文件面板。
- 能看到运行过程、变更提示、运行详情和最终报告。
- 如果网络或模型波动，可以切到已完成的历史 Run 或使用 `examples/python-bugfix` 做更短路径演示。

## 8. 最推荐的讲述顺序

```text
先讲架构 -> 再跑任务 -> 展示过程证据 -> 展示审批 diff -> 展示完成证据 -> 回答为什么这叫 AgentOS
```

这条顺序能避免演示变成“我点了一个按钮，它改好了代码”。评委真正看到的是：系统把 Agent 的思考、工具、权限、上下文、扩展、验证和记忆都纳入了可观察的工程闭环。

## 9. 更自然的口播版

如果不想照表格念，可以用下面这版更顺口的稿子：

```text
大家好，这是 MiniAgentOS Coder，一个本地 Coding Agent 运行时。

它和普通代码助手最大的区别是：普通代码助手主要围绕聊天和结果，而这个系统围绕一次受治理的 Agent Run。用户给出任务后，后端会先把任务编译成 AgentContract，明确运行模式、工具权限、预算、完成条件和审批策略。

接着系统会构建 Context Pack。它不会把整个仓库直接塞给模型，而是根据任务收集项目规则、相关文件、测试信息、Skill、记忆和当前 diff，并记录上下文来源和 Token 预算。

模型拿到上下文后，也不能直接操作文件系统。它只能输出结构化 Action IR，比如读文件、运行命令、申请补丁。每个动作都会经过 Tool Gateway、Policy、Guard 和 Sandbox，必要时还会进入用户审批。

这里我用 examples/skill-invoice-rules 做演示。这个项目包含发票计算规则、失败测试、项目 Skill、可选 MCP 和 Hook，所以可以看到完整链路：上下文收集、模型判断、工具调用、代码修改、补丁审批和测试验证。

运行过程中，前端展示的不是静态日志，而是后端 Trace 事件。评委可以看到 Agent 读了哪些文件、为什么运行命令、什么时候生成补丁、审批是否通过、验证是否完成。

当代码发生变化时，系统会把变更提示和项目文件面板联动起来。用户可以点进文件查看 diff，再决定接受或拒绝，而不是只能相信模型描述。

最后，任务完成也不是靠模型说“完成了”。Completion Guard 会检查补丁、测试、报告和模式约束。运行结束后，还会生成报告、保存 Trace，并沉淀可确认的项目记忆。

所以这个项目的核心亮点，是把 Coding Agent 做成一个本地、可控、可观察、可扩展、可回放的工程运行时，而不只是一个能帮我改代码的聊天窗口。
```
