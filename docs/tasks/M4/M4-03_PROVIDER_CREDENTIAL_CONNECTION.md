# M4-03 Provider、凭据与连接测试

> 状态：Implemented  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 工作分支：`work/m4-03-provider-credential-connection`

## 目标

安全连接外部API和用户已运行的本地兼容服务，统一认证、流式、取消和错误处理。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不下载、安装或监管本地模型。
- 不建设WorldForge请求代理。
- 不让设置页执行任意脚本。
- 不实现GenerationRun、Prompt Registry或具体T0/T1业务流程。

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

- `packages/contracts/src/provider.ts`
- `packages/core-service/src/provider-configs.ts`
- `packages/core-service/src/provider-adapters.ts`
- `packages/core-service/src/provider-connection.ts`
- `packages/core-service/src/provider-endpoint.ts`
- `packages/core-service/src/provider-errors.ts`
- `apps/desktop/main/src/credential-broker.ts`
- `apps/desktop/main/`中的Provider IPC与Core监管接线
- `apps/desktop/preload/`
- `apps/desktop/renderer/`中的Provider设置界面
- `migrations/app/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 实现AIProvider最小接口及OpenAI兼容、Anthropic和经批准Custom适配器。
2. Provider只转换协议，不查询项目数据、不持久化Candidate。
3. 连接测试覆盖URL、认证、模型列表/缺失、最短生成、流式和结构化能力。
4. 承接M0-02既有Credential Broker：实际密钥由Electron `safeStorage`调用可用的OS安全加密后端加密，密文保存到权限受限的本地凭据文件；数据库只保存`credentialRef`，明文只在请求内存中短暂存在。
5. `safeStorage`不可用或返回`basic_text`等不安全后端时必须阻断凭据写入和读取，不得静默降级为明文存储。
6. 区分本机、局域网和外部端点并给出隐私提示；危险协议、跨主机重定向和不受控本地资源访问必须拒绝。
7. 标准化连接、认证、限流、超时、中断、取消和危险URL错误。
8. Provider相关IPC使用独立领域注册模块，避免继续扩大通用`ipc-handlers.ts`；Renderer不得直接访问网络客户端或凭据值。

## 测试与证据

- 正常、认证失败、限流、超时、断流、取消和无Token统计。
- 本地无密钥服务、局域网提示、外部HTTPS和危险URL。
- `safeStorage`不可用、`basic_text`后端、凭据文件损坏、并发写入和删除。
- 凭据不进入数据库、Renderer、普通日志和错误details。
- Provider不可用时基础写作、搜索、恢复和导出不受影响。

证据保存到：`docs/test-evidence/M4-03/`

## 实现结果

- 复用App DB `provider_configs`、Electron `safeStorage` Credential Broker和Core Utility Process，数据库只保存`credentialRef`，未建立第二套配置或凭据真源。
- 实现OpenAI兼容与Anthropic适配器；Custom协议仅允许仓库显式注册的批准适配器。
- 连接测试覆盖模型列表或缺失、最短生成、流式、结构化输出、Token统计、认证、限流、超时、中断和取消。
- Provider IPC拆分为独立领域注册模块；Main负责凭据解析，Preload仅暴露受控命令，Renderer不接触网络客户端或凭据明文。
- 端点按回环、局域网和外部分类；外部强制HTTPS；阻断嵌入凭据、query、fragment、保留地址、实例元数据、重定向及DNS跨信任边界解析。
- 请求取消和超时覆盖响应头、JSON正文与SSE完整生命周期；OpenAI流在`finish_reason`和`[DONE]`同时存在时只产生一次完成事件。
- 设置页支持保存配置、凭据替换/移除、连接测试、删除和明确的操作反馈。

## 验证结果

- Provider专项：Contracts、端点安全、凭据IPC和协议集成共13项回归通过。
- 全仓：Lint、Typecheck、Build、全量测试、Migration、Integration、Security、Electron E2E、Unit和Eval全部通过。
- Provider不可用、配置为空或凭据缺失时，不影响离线写作、搜索、恢复和导出基础路径。
- 按用户指令，M4-03收口后保持Implemented，暂不激活M4-04。
- 本次收口仅同步任务状态与追踪，不修改产品代码，不激活M4-04。

## 完成条件

- Provider不可用不影响离线写作。
- 所有协议错误映射为稳定错误码。
- 凭据方案与实际实现一致，不再以“OS Credential Store”笼统描述密文文件架构。
- Provider配置、连接测试、Main/Preload/Renderer接线和安全边界均有真实Electron证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
