# M6-02 AI语义与人物弧光一致性校验

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-ai-semantic-arc-validation`

## 目标

基于正文证据和权威连续性数据提示人物行为、设定、衔接、知情、文风和弧光风险。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不把AI问题标成权威裁决。
- 不读取pending提案作为已确认状态。

## 依赖

M6-01、M4-05、M3-05

## 关联

- 需求：REQ-031、REQ-045
- 功能ID：VAL-003、ARC-003、ARC-004
- 验收：P0-044、P0-071、P0-072

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/decisions/ADR-006-character-arc-via-state-proposal.md`
- `docs/product/FUNCTION_CATALOG.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`

## 实施内容

1. 输出包含type、severity、logicalBlockId、quote、rationale、evidenceIds、suggestion和confidence。
2. 无证据ID的问题不得标高风险，文案使用可能/建议核对。
3. 检查人物行为、Canon偏离、时间衔接、知情泄露、伏笔和文风。
4. 人物弧光只读取已确认ArcMilestone和EntityState。
5. 支持忽略、静音、降级、误报和转待办。
6. 模型不支持或Eval不达标时降级为规则/人工检查。

## 测试与证据

- 证据缺失、低置信、误报、stale输入和未验证模型。
- pending弧光提案不生效，已确认状态正确参与。
- AI不可用不影响规则校验。

证据保存到：`docs/test-evidence/M6-02/`

## 完成条件

- AI校验只提示风险，不充当裁判。
- 弧光一致性结果可追溯到正文和权威状态。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
