# M6-02 AI语义与人物弧光一致性校验

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-02-ai-semantic-arc-validation`

## 目标

基于正文证据和已确认的权威连续性数据，提示人物行为、设定、衔接、知情、文风和弧光风险。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。M6-02只负责语义风险提示，不负责状态提取或权威状态更新。

## 非目标

- 不把AI问题标成权威裁决。
- 不读取pending StateProposal作为已确认状态。
- 不执行`state_extract`或直接推进人物弧光。
- 不因AI不可用阻断规则校验、写作、定稿或发布前人工检查。

## 依赖

M6-01、M5-06

## 承接基线

- M5-06已经完成真实状态提取与StateProposal作者裁决接线。
- M6-01提供确定性/统计校验、ValidationIssue和修订待办基础。
- M4-02提供stale快照回退、时序过滤和可追溯约束包。
- M3-05/M3-06提供人物弧光、已确认状态、伏笔和快照权威模型。

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
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 输出包含`type`、`severity`、`logicalBlockId`、`quote`、`rationale`、`evidenceIds`、`suggestion`和`confidence`。
2. 无证据ID的问题不得标高风险，文案使用“可能”“建议核对”等风险语言。
3. 检查人物行为、Canon偏离、时间衔接、知情泄露、伏笔、文风和人物弧光。
4. 人物弧光和状态一致性只读取作者已确认的ArcMilestone、EntityState、KnowledgeState和有效EndingSnapshot。
5. pending、rejected或尚未裁决的StateProposal不得进入权威约束；其存在只可作为“有待作者确认”的信息提示。
6. stale快照不得直接使用，必须复用M4-02的权威回退和`snapshotSource`追溯。
7. 校验结果写入ValidationIssue或对应建议模型，支持忽略、静音、降级、误报和转待办。
8. AI校验结果不得自动创建StateProposal、修改Candidate、推进弧光或写Draft。
9. 模型不支持、Eval不达标或Provider不可用时降级为规则/人工检查。
10. 界面明确区分“已确认事实”“AI风险提示”“待确认状态变化”。

## 测试与证据

- 证据缺失、低置信、误报、stale输入和未验证模型。
- pending提案不生效，accepted/edited状态正确参与。
- rejected提案、旧Version提案和跨项目状态不进入校验。
- AI不可用不影响规则校验。
- ValidationIssue可忽略、静音、转待办且不改变权威状态。
- 人物弧光结果可追溯到正文块和已确认状态。

证据保存到：`docs/test-evidence/M6-02/`

## 完成条件

- AI校验只提示风险，不充当裁判。
- 弧光一致性结果可追溯到正文和权威状态。
- pending StateProposal进入权威校验输入的次数为0。
- stale快照全部通过权威回退处理。
- 状态提取和状态裁决职责没有在本任务中重复实现。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI或测试文档。
