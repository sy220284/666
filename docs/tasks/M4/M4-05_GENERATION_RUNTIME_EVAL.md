# M4-05 GenerationRun、流式运行与模型支持档案

> 状态：Planned  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 建议分支：`work/m4-05-generation-runtime-eval`

## 目标

在M0-04既有TaskProtocol和M0-07 ProviderStub基础上，建立GenerationRun权威持久化、生产Candidate收口、通用结果引用、partial结果处理和模型支持档案，禁止建设第二套任务状态机。

## 阶段定位

完成AI基础设施的持久化运行层，使M5能够安全编排T0、T1、改写、融合和状态提取。

## 非目标

- 不实现具体T0/T1、改写、融合或状态提取产品流程。
- 不重建MessagePort、delta、背压、订阅、取消和活动任务快照协议。
- 不显示伪造进度，不宣称应用重启后可恢复已经消失的网络流。
- 不使用Fixture Candidate入口承载生产结果。
- 不在本任务定义Skeleton结构化Payload；该语义归M5-01。

## 依赖

M4-04、M4-03、M0-04、M0-07

## 承接基线

启动任务前必须复核并复用：

- M0-04 TaskProtocol：任务注册、项目隔离订阅、MessagePort、delta批处理、背压、usage、取消、活动任务和快照。
- M0-07 ProviderStub：normal、token-stream、disconnect、timeout、rate-limit、invalid-json、cancellation等场景。
- M4-02 ConstraintPackage：来源、裁剪日志、`contentHash`、`constraintHash`和来源Version。
- M4-03 Provider配置、凭据引用、连接能力和错误归一化。
- M4-04 Prompt版本、输入输出Schema、Parser和Cleaner。

## 关联

- 需求：REQ-028、REQ-030
- 功能ID：AI-009、AI-010、CND-005基础
- 验收：P0-023—P0-026

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/tasks/M0/M0-04_IPC_EVENT_TASK_PROTOCOL.md`
- `docs/tasks/M0/M0-07_AI_DIFF_SPIKE.md`

## 主要影响范围

- `migrations/project/`
- `packages/core-service/`
- `packages/contracts/`
- `packages/prompts/`（仅运行元数据接线）
- `apps/desktop/main/`中的独立Generation IPC注册模块
- `apps/desktop/preload/`
- `apps/desktop/renderer/`中的任务状态与恢复入口
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 职责边界

```text
TaskProtocol（既有）
├─ 内存任务与事件
├─ MessagePort、delta与背压
├─ 订阅和项目隔离
├─ 取消意图
└─ 活动任务快照

GenerationRun（本任务）
├─ 数据库权威运行记录
├─ Prompt、约束、Provider和Model追溯
├─ 通用GenerationResultRef
├─ partial持久化决策
└─ 重启后可查询状态

M5业务任务
├─ M5-01：Skeleton结构化Payload与骨架类型守卫
├─ M5-02/03/04：Prose Candidate业务输入与产品流程
└─ M5-06：StateProposal批次业务校验与作者裁决接线
```

## 通用结果引用

```text
GenerationResultRef
├─ candidate
│  ├─ resultId
│  └─ candidateKind: prose | skeleton
└─ state_proposal_batch
   └─ resultId
```

TaskProtocol现有`ai.candidateSaved`与`candidateIds`必须保持历史兼容；生产化时增加通用结果事件或兼容投影，禁止把StateProposal批次伪装成Candidate ID。

## 实施内容

1. 建立GenerationRun权威模型，记录`requestId`幂等、`runType`、`taskId`、项目/章节、`baseRevision`、Provider、实际Model、Prompt ID/Version、状态、usage、重试和错误码。
2. 记录本次实际使用的ConstraintPackage引用、`constraintHash`、`contentHash`、来源Version、来源摘要和裁剪日志；禁止只保存Hash而丢失审计上下文。
3. 真实阶段使用`queued`、`assembling_constraints`、`calling_model`、`receiving_output`、`parsing_output`、`saving_candidate`、`validating_candidate`等，并与真实程序状态对应；数据库终态与内存阶段语义不得互相伪装。
4. 在现有TaskProtocol上增加向后兼容的`GenerationResultRef`发布与快照投影，支持Candidate和StateProposal批次；旧Candidate事件读取保持兼容。
5. 复用TaskProtocol发布内存事件和delta；切章、切页只影响展示订阅，不自动取消底层任务。
6. 取消后调用Provider Abort并阻止未来delta进入Renderer；迟到结果必须消费且不得回写已取消的展示状态。
7. 已接收内容只能由作者明确选择“保存为partial”或“丢弃”；partial保存、Run终态和结果引用必须原子收口。
8. 增加生产Prose Candidate创建入口，替代Fixture创建接口；Candidate必须关联GenerationRun并保存完整度、来源和基础Revision。Skeleton结构化语义由M5-01在同一入口协议上扩展。
9. Run成功与全部结果引用在同一事务中完成；解析、保存或校验失败时不得留下伪成功Run、孤立Candidate或孤立结果引用。
10. 为后续`state_extract`建立`state_proposal_batch`结果引用类型和原子挂接能力，但本任务不执行具体提取业务。
11. 应用重启后只恢复已持久化Run、Candidate和结果引用；内存流中断必须显示真实中断状态。
12. 按Provider + Model + Task + PromptVersion持久化`verified/limited/unverified`和Eval报告，未验证模型允许风险继续但不得宣称稳定。
13. Generation相关IPC独立注册，禁止继续把AI运行通道堆入通用`ipc-handlers.ts`。

## 测试与证据

- 复用ProviderStub覆盖正常、流式、取消、断流、超时、限流、无效输出和无usage。
- 多任务并行、项目隔离、切章、切页、重连、取消、迟到delta和背压。
- 旧Candidate事件兼容、通用结果事件、Candidate与StateProposal批次类型隔离。
- Run与Candidate原子提交、解析失败回滚、孤立引用拒绝和requestId幂等。
- partial保存、丢弃、重启查询和禁止误标完整。
- Prompt、ConstraintPackage、Provider、Model和来源Version追溯。
- ModelSupportProfile与Eval版本绑定、未验证模型提示。
- 安全测试确认正文、完整Prompt、约束全文、密钥和原始模型响应不进入普通日志。

证据保存到：`docs/test-evidence/M4-05/`

## 完成条件

- AI运行时与具体写作流程解耦，并复用既有TaskProtocol。
- Run、Candidate、StateProposal批次和结果引用完整，无伪成功、孤立记录或跨项目泄漏。
- 取消后无未来delta进入Renderer，partial只能由作者明确保存。
- 应用重启只展示真实持久化状态，不伪装网络流已恢复。
- M4退出时具备可安全承载T0/T1、改写、融合和state_extract的基础设施。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、安全、性能或测试文档。
