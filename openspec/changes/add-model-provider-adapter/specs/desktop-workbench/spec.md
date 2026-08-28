# Desktop Workbench 增量规格

## ADDED Requirements

### DW-006 模型配置状态

工作台 SHALL 通过 Daemon API 获取当前项目的模型 Provider 就绪状态，而不是在前端读取 API Key。

#### Scenario: 显示缺失配置

- GIVEN 当前项目尚未设置模型名或 API Key 环境变量
- WHEN 工作台查询模型状态
- THEN Daemon SHALL 返回 `configured=false` 和非敏感问题列表
- AND 响应 SHALL NOT 包含任何密钥值

