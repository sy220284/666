# M0-07 AI输出协议与中文Diff Spike

> 状态：Planned  
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 建议分支：`spike/m0-ai-diff`

## 目标

在完整AI功能前验证T0/T1输出模式、Provider故障、中文长段Diff和性能预算，输出明确采用或降级决策。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不建设生产Prompt库。
- 不建设完整Candidate审阅UI。
- 不宣称真实模型已稳定支持。

## 依赖

M0-03、M0-04、M0-05

## 关联

- 需求：REQ-026、REQ-029、REQ-030
- 功能ID：AI-004、AI-005、AI-010、CND-002
- 验收：P0-025、P0-026、P0-029

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `packages/contracts/`
- `packages/prompts/`
- `packages/editor-core/`
- `packages/testkit/`
- `evals/`
- `tests/performance/`

## 实施内容

1. 用Provider Stub验证T0结构化骨架、多Candidate和一次受控格式修复。
2. 验证T1纯文本流优先、稳定模型可选结构化分块的双模式协议。
3. 验证正常、断流、无效JSON、超时、取消和partial结果。
4. 实现logicalBlockId结构Diff和中文字符Diff原型，覆盖新增、删除、移动、拆分、合并。
5. 评估Diff使用主线程、分片或Worker的量化阈值。
6. 生成最小Eval报告和ModelSupportProfile样例。

## 测试与证据

- 5000字Diff首屏≤500ms、完整≤1.2s；20000字渐进计算可取消。
- Schema无效时不猜测大幅修复JSON。
- T0/T1无法稳定时有明确绕过或降级路径。

证据保存到：`docs/test-evidence/M0-07/`

## 完成条件

- 形成冻结决策、性能报告、Eval基线和失败降级方案。
- 不得用UI占位掩盖算法或模型能力未达标。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
