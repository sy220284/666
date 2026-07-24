# M4-03 Provider、凭据与连接测试

> 状态：In Progress
> 里程碑：M4 检索与AI基础设施
> 优先级：P0
> 建议分支：`feat/m4-provider-credential-connection`

## 目标

安全连接外部API和用户已运行的本地兼容服务，统一认证、流式、取消和错误处理。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不下载、安装或监管本地模型。
- 不建设WorldForge请求代理。
- 不让设置页执行任意脚本。

## 依赖

M3、M0-02、M0-04、M0-05

## 关联

- 需求：REQ-023、REQ-024、REQ-043
- 功能ID：AI-001、AI-002
- 验收：P0-022、P0-067、P0-070

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/LOCAL_AI_SERVICE_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/contracts/ERROR_CODES.md`

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/renderer/`
- `migrations/app/`
- `tests/integration/`
- `tests/security/`

## 实施内容

1. 实现AIProvider最小接口及OpenAI兼容、Anthropic和经批准Custom适配器。
2. Provider只转换协议，不查询项目数据、不持久化Candidate。
3. 连接测试覆盖URL、认证、模型列表/缺失、最短生成、流式和结构化能力。
4. 实际密钥只存OS Credential Store，数据库保存credentialRef。
5. 区分本机、局域网和外部端点并给出隐私提示。
6. 标准化连接、认证、限流、超时、中断、取消和危险URL错误。

## 测试与证据

- 正常、认证失败、限流、超时、断流、取消和无Token统计。
- 本地无密钥服务和危险URL。
- 凭据不进入数据库、Renderer、普通日志和错误details。

证据保存到：`docs/test-evidence/M4-03/`

## 完成条件

- Provider不可用不影响离线写作。
- 所有协议错误映射为稳定错误码。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
