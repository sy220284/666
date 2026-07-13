# M3-01 Provider、连接测试与凭据

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m3-provider-layer`

## 目标

安全连接外部API和用户已运行的本地兼容服务，并统一认证、流式、取消和错误处理。

## 依赖

M0-06、M2全部完成。

## 关联

- 需求：REQ-023、REQ-024、REQ-043
- 验收：P0-022、P0-067、P0-070

## 必读文档

- `docs/ai/LOCAL_AI_SERVICE_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/contracts/ERROR_CODES.md`

## 实施内容

1. 实现`AIProvider`最小接口。
2. 实现OpenAI兼容和Anthropic适配器。
3. 连接测试：URL、认证、最短生成、流式和结构化输出。
4. OS Credential Store只保存实际密钥，数据库保存credentialRef。
5. 区分本机、局域网和外部端点并给出隐私提示。
6. 标准化连接、认证、限流、超时、中断和取消错误。
7. 建立ModelSupportProfile基础结构。

## 非目标

不安装、下载或监管本地模型；不允许设置页执行任意脚本；不增加推测性能力位。

## 测试

正常、认证失败、限流、超时、中断、取消、无模型列表、无Token统计、本地无密钥服务和危险URL。

## 完成条件

Provider不可用时不影响离线编辑；凭据不进入数据库、Renderer和普通日志；所有协议错误映射为稳定错误码。
