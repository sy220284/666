# M4-03 实施证据摘要

## 实现范围

- 复用`provider_configs`、Electron `safeStorage` Credential Broker、Core Utility Process和受信IPC，不建立第二套配置或凭据真源。
- 实现OpenAI兼容与Anthropic适配器、模型列表/最短生成/流式/结构化输出连接探测、稳定错误语义和本机/局域网/外部端点提示。
- Provider IPC拆分为独立领域注册模块；Renderer不接触凭据明文或网络客户端。
- Base URL禁止凭据、query和fragment；外部端点强制HTTPS；DNS解析不得跨越或改变网络信任边界。
- 取消和超时覆盖响应头及正文/SSE完整生命周期；OpenAI完成事件保持单次确定性输出。
- 设置页支持配置保存、凭据替换/移除、连接测试和删除，并提供真实操作反馈。

## 回归覆盖

- Contracts、端点安全、协议适配、认证/限流/超时/中断/取消、无Token统计、凭据IPC与泄漏边界。
- 全仓Typecheck、Lint、Build和真实Electron Provider设置页回归。
- Provider不可用不改变基础离线写作、搜索、恢复和导出路径。
