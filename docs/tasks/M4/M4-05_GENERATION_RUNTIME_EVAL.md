# M4-05 GenerationRun、流式运行与模型支持档案

> 状态：Planned  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 建议分支：`feat/m4-generation-runtime-eval`

## 目标

建立真实AI任务运行时、持久化状态、取消、partial结果、模型支持档案和Eval闭环。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不实现具体T0/T1产品流程。
- 不显示伪造进度。

## 依赖

M4-04、M0-07

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

## 主要影响范围

- `migrations/project/`
- `packages/core-service/`
- `packages/contracts/`
- `packages/prompts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 实现GenerationRun、requestId幂等、runType、baseRevision、Provider/Model、Prompt版本、状态、usage和错误码。
2. 真实阶段：queued、assembling_constraints、calling_model、receiving_output、parsing_output、saving_candidate、validating_candidate。
3. 切章和切页不取消，任务条按taskId恢复。
4. 取消停止未来delta，支持明确保存或丢弃partial Candidate。
5. 应用重启后只恢复已持久化Run/Candidate，不宣称内存流已保存。
6. 按Provider+Model+Task+PromptVersion记录verified/limited/unverified和Eval报告。
7. 未验证模型允许风险继续，但界面不得宣称稳定。

## 测试与证据

- 多任务并行、切章、重连、取消、断流、超时、partial保存和重启。
- 阶段与真实程序状态一致，任务快照可恢复。
- 支持档案与Eval版本绑定。

证据保存到：`docs/test-evidence/M4-05/`

## 完成条件

- AI运行时与具体写作流程解耦。
- M4退出时具备可安全承载T0/T1的基础设施。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
