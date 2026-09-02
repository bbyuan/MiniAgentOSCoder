# MiniAgentOS Coder

GitHub 仓库地址：https://github.com/bbyuan/MiniAgentOSCoder

MiniAgentOS Coder 是一个面向本地代码任务的 Agent 运行时与可视化工作台。它关注的不是让模型一次性输出代码，而是把一次 Coding Agent 运行组织成启动前可配置、执行中可约束、结束后可审计，并能被形式化解释的完整过程。

本项目与本人以第二作者身份参与的 CCF-A 类会议 SOSP workshop AgentOS'26 Research Track 论文《An AgentOS Needs a Formal Representation of Agents》相呼应，将 AgentOS 的运行时治理思想和程序语言中的形式化 Agent 表示落到真实工程系统中。

## 核心贡献

1. 将提示词、上下文、记忆、工具、预算和审批从隐式工程约定提升为显式运行契约。
2. 用 DSL 连接论文中的形式语义和产品中的真实配置、执行与检查页面。
3. 用 trace 和 evidence 把一次 Agent 运行沉淀为可检查、可复现的工程对象。

## 如何运行

准备环境变量：

```bash
cp .env.example .env
# 编辑 .env，填写模型 API Key
```

启动后端：

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --env-file ../.env
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

完整验证：

```bash
make verify
```

## 项目亮点

### 契约化启动

系统不会把任务直接交给模型，而是先把任务描述、工作区、模式和运行配置编译成 `AgentContract`，提前固定模型路线、上下文范围、预算上限、沙箱级别和副作用审批策略。

### 形式化 DSL 投影

系统将 `AgentContract` 投影为基于 `λA` 语义的 DSL，用类型化项描述 Agent 的可执行结构，用效应刻画文件、命令、网络、记忆等能力边界，用成本等级表达步骤和调用上限，并用 `guard` 谓词承载审批、策略和完成检查。

### 受治理的执行闭环

模型每一步输出都会先解析为结构化 `ActionIR`，而不是直接落地执行；随后系统通过工具网关确认动作是否合法，通过策略检查判断是否越界，通过沙箱隔离命令和文件访问，并在高风险副作用发生前触发审批。执行结果作为 observation 回到下一轮上下文，形成决策、检查、执行、反馈的闭环。

### 上下文、记忆与扩展能力

系统支持工作区扫描、上下文选择与压缩、项目记忆和长期记忆，并在高级设置中接入 Skill、MCP Server 和 Hooks，把项目规则、外部工具和自动检查纳入同一套治理机制。

### 结束后可审计

系统保留运行报告、上下文组成、工具轨迹、策略评估、沙箱记录、测试结果、trace 和 evidence，使一次运行可以被复盘、验证和复现。相比普通聊天式代码助手，本项目把最终回答、代码变更、测试结果和证据来源放在同一个运行档案中。

## 适用场景

MiniAgentOS Coder 适用于本地代码修复、功能实现、代码审查、规范驱动开发和受控工具调用。它强调的不是单次回答质量，而是把模型能力放入可配置的运行环境中，使开发者可以在同一界面完成任务启动、过程观察、风险审批、测试验证和结果追溯。

## 工程实现

项目包含约 8.1 万行源码、测试、规范与示例，覆盖后端 Agent 运行时、前端可视化工作台、契约与 DSL 生成、受控工具执行、运行档案与审计视图，并配套本地示例工作区和测试。整体系统已经形成从运行契约、形式化表示、受控执行到结果审计的端到端 Agent Runtime 原型。

## 目录说明

- `backend/`：Daemon API、Agent 运行循环、契约编译、工具网关、沙箱、记忆、轨迹和报告。
- `frontend/`：本地工作台界面，包括运行配置、实时执行、详情审计和形式化程序展示。
- `examples/`：用于演示和测试的本地代码任务工作区。
- `openspec/`：项目规范和变更说明。
