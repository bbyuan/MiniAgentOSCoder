# 接入 OpenAI-Compatible 模型 Provider

## 背景

自主 Agent Loop 已能用确定性模型完成多步规划，但尚不能调用真实模型。运行时需要一个可配置、可诊断且不会泄露密钥的 Provider 边界，使本地 Daemon 能连接 OpenAI 或兼容 Chat Completions 协议的模型服务。

## 变更内容

- 从 `.agent/config.yaml` 编译类型化模型 Provider 配置。
- 实现 OpenAI-compatible Chat Completions 客户端和可替换的 JSON Transport。
- 通过环境变量解析 API Key 和可选 Base URL，不把密钥写入配置、日志、Trace 或 API 响应。
- 提供模型客户端工厂，在启动真实执行前校验 provider、模型名、密钥和 URL。
- 新增只读 `/models/status` API，供桌面工作台和 CLI 检查模型配置是否可用。
- 为请求映射、响应解析、错误处理、配置缺失和密钥隔离增加离线测试。

## 能力影响

- `agent-runtime`：新增真实模型 Provider 适配与配置诊断能力。
- `desktop-workbench`：新增可供设置页消费的模型状态接口。

## 不在本阶段

- 自动执行 Daemon 中创建的 run。
- 流式模型响应。
- OAuth、云端密钥托管和多租户凭证。
- Provider 模型列表发现与模型价格同步。

