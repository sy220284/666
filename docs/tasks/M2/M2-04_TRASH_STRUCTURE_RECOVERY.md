# M2-04 回收站、拆章、并章与结构恢复

> 状态：Implemented  
> 里程碑：M2 编辑安全与版本核心  
> 优先级：P0  
> 建议分支：`feat/m2-trash-structure-recovery`  
> 实现真源：`4a90ce7093de0df0cb568f3a1524549f3cbaf716`（含 PR #28 质量硬化）

## 目标

闭环卷、章和正文块的软删除、恢复、永久删除及高风险拆并章操作。

## 阶段定位

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

## 非目标

- 不实现SceneBeat跨章移动，归M3-02。

## 依赖

M2-03、M1-08

## 关联

- 需求：REQ-014、REQ-015
- 功能ID：PLN-005、TRS-001
- 验收：P0-034、P0-035、P0-056

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `tests/integration/`
- `tests/e2e/`
- `tests/migration/`
- `tests/security/`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 实施内容

1. 完善卷章TrashEntry、恢复原位置、冲突位置选择和永久删除引用检查。
2. 拆章、并章和正文块跨章移动先生成预览。
3. 所有高风险操作前创建操作恢复点。
4. 结构修改通过统一Patch、Revision、Hash和LockGuard。
5. 历史Version保持不变，操作后字数、顺序和activeDraft引用一致。

## 测试与证据

- 原位置占用、锁定块、引用存在、事务中断和恢复取消。
- 拆章、并章、跨章移动后的正文与统计一致。
- 永久删除取消和恢复点可用。

证据保存到：`docs/test-evidence/M2-04/`

## 完成条件

- 任何失败路径下原结构和正文保持完整。
- M2退出时编辑、版本、Candidate和结构安全闭环可用。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
