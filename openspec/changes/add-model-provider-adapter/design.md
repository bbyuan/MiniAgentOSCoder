# 设计

## 上下文

`AgentRunLoop` 只依赖 `ModelClient` 协议，因此真实 Provider 应作为协议实现接入，不能绕过 Planner、Action IR 或 Tool Gateway。模型配置来自项目 `.agent/config.yaml`，敏感值只允许在调用时从环境变量读取。

## 目标

- 支持 OpenAI-compatible `/chat/completions` 接口。
- 在发起网络请求前给出可读、可机器判断的配置错误。
- 保持模型客户端可离线测试，不要求 CI 访问外网或消耗 Token。
- 让桌面端和 CLI 看到相同的 Provider 就绪状态。

## 非目标

- 在本阶段引入异步任务队列或后台执行线程。
- 把 API Key 保存到仓库、RunStore 或前端状态。
- 为各家 Provider 编写独立 SDK 适配器。

## 关键决策

### 1. 配置与密钥分离

`ModelProviderConfig` 保存 provider、模型名、环境变量名称、Base URL、超时和 JSON 模式等非敏感信息。`create_model_client` 在运行时读取指定环境变量并构造客户端。客户端的密钥字段不参与对象 repr 和序列化。

### 2. 可替换 Transport

客户端依赖 `JsonTransport` 协议。生产实现使用 Python 标准库发送 HTTPS JSON；测试实现记录请求并返回固定响应。这样无需引入特定厂商 SDK，也能验证 Authorization、请求体和响应解析。

### 3. 最小兼容请求

客户端发送 `model`、`messages`，并按配置选择是否发送 `response_format={type: json_object}` 及输出 Token 参数。模型返回内容仍由 Planner 按不可信文本解析成 Action IR。

### 4. 安全诊断 API

`GET /models/status` 返回 provider、模型名、脱敏 Base URL、是否配置完成和问题代码。它只报告 API Key 环境变量是否存在，不返回变量值。环境变量 Base URL 会移除用户信息、查询参数和 fragment 后再显示。

### 5. 错误边界

配置错误抛出 `ModelConfigurationError`；HTTP、网络、JSON 和响应结构问题转换为 `ModelProviderError`。错误消息不包含 Authorization Header、API Key 或原始响应正文。

## 风险与权衡

- 不同兼容服务对 JSON mode 和 Token 字段支持不完全一致，因此二者均可配置。
- 标准库 Transport 当前是同步调用，符合本地单 run P0；后续接后台 Run Worker 时再提供异步实现。
- Provider 返回的 usage 可能缺失，运行时只能累计服务端实际提供的字段；后续可增加本地 Token 估算作为保守回退。

