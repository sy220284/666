# M1-05 Block Patch、内容Hash与Revision

> 状态：In Progress
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-block-patch-revision`

## 目标

统一所有正文写入为结构化Block Patch和原子Revision事务，为自动保存、锁定、Candidate和批量操作提供唯一写入通道。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现锁定块。
- 不实现Candidate比较和采用。

## 依赖

M1-04

## 关联

- 需求：REQ-007、REQ-011
- 功能ID：EDT-001、VER-002
- 验收：P0-018、P0-019

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/database/DATABASE_SCHEMA.md`

## 主要影响范围

- `packages/editor-core/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `migrations/project/`
- `tests/unit/`
- `tests/integration/`

## 实施内容

1. 实现语义内容标准化和SHA-256 contentHash。
2. 实现insert、update、delete、move有序操作数组和strict Schema。
3. 每批Patch携带requestId与baseRevision，update/delete/move携带expectedHash。
4. Core先在内存工作集按顺序验证，全部通过后单事务提交。
5. 一次成功事务Revision只增加1，失败整批回滚。
6. 记录必要Patch日志，为后续高风险inverse patch和审计提供基础。
7. 禁止任何Renderer或Repository旁路直接修改DraftBlock。

## 测试与证据

- 旧Revision、Hash变化、非法顺序、重复requestId和部分失败。
- 拆分、合并、移动后的logicalBlockId和Hash稳定。
- 事务故障、应用关闭和重启后无半提交。

证据保存到：`docs/test-evidence/M1-05/`

## 完成条件

- 编辑、自动保存和后续所有正文写入可复用同一Patch入口。
- 静默覆盖率为0。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
