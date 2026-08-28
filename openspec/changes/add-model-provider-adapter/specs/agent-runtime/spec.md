# Agent Runtime 增量规格

## ADDED Requirements

### AR-009 模型 Provider 适配

运行时 SHALL 从项目配置和环境变量构造 OpenAI-compatible 模型客户端，并将模型响应作为不可信文本交回 Planner。

#### Scenario: 调用兼容模型接口

- GIVEN 项目配置了 provider、模型名、Base URL 和 API Key 环境变量
- WHEN AgentRunLoop 请求下一步动作
- THEN 客户端 SHALL 向兼容 Chat Completions 接口发送模型消息
- AND SHALL 将响应文本和 usage 转换为 `ModelResponse`

#### Scenario: 配置缺失时拒绝调用

- GIVEN 模型名未设置或 API Key 环境变量不存在
- WHEN 运行时创建模型客户端
- THEN SHALL 在网络请求前返回结构化配置错误
- AND SHALL 指明缺失项但不暴露任何密钥值

#### Scenario: Provider 响应异常

- GIVEN Provider 返回 HTTP 错误、无效 JSON 或缺少消息内容
- WHEN 客户端解析响应
- THEN SHALL 返回脱敏的 Provider 错误
- AND SHALL NOT 把 Authorization Header 或原始响应正文写入错误信息

#### Scenario: 查询模型配置状态

- GIVEN 桌面工作台或 CLI 已打开项目
- WHEN 请求 `/models/status`
- THEN Daemon SHALL 返回非敏感 Provider 配置和就绪状态
- AND SHALL NOT 返回 API Key 或环境变量值

