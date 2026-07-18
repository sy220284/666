# M2-02 Candidate与完整Version模型

> 状态：In Progress  
> 里程碑：M2 编辑安全与版本核心  
> 优先级：P0  
> 建议分支：`work/m2-02-candidate-version-model`

## 目标

建立Draft、Candidate、Version三层正文模型，先以Fixture Candidate验证隔离和持久化。

## 阶段定位

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

## 非目标

- 不接入真实Provider。
- 不实现复杂Diff界面。

## 依赖

M1-07、M2-01

## 关联

- 需求：REQ-012
- 功能ID：CND-001、VER-001
- 验收：P0-020、P0-021

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/database/DATABASE_SCHEMA.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `packages/testkit/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`

## 实施内容

1. 实现Candidate、CandidateBlock、candidateType、baseDraftRevision、complete/partial和状态。
2. 实现GenerationRun可空的Fixture来源，后续真实AI接入不改变Candidate模型。
3. Candidate创建、查看、列表和丢弃不修改Draft。
4. 补齐Version类型、parentVersionId、来源Revision和内容Hash。
5. 建立Candidate与Version的来源映射和不可变约束。

## 测试与证据

- 未确认Candidate不改变Draft。
- complete/partial、pending/accepted/discarded状态机。
- Version不可变和跨项目关联拒绝。

证据保存到：`docs/test-evidence/M2-02/`

## 完成条件

- Candidate隔离写入次数为0。
- 后续AI只需生成Candidate，不需要重新设计正文模型。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
