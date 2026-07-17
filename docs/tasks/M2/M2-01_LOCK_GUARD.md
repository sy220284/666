# M2-01 锁定块与Core LockGuard

> 状态：Implemented  
> 里程碑：M2 编辑安全与版本核心  
> 优先级：P0  
> 建议分支：`feat/m2-lock-guard`

## 目标

建立UI与Core双层锁定保护，使所有正文修改路径无法破坏作者锁定内容。

## 阶段定位

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

## 非目标

- 不实现Candidate界面。
- 不实现全项目替换。

## 依赖

M1-05

## 关联

- 需求：REQ-010、REQ-011
- 功能ID：EDT-005
- 验收：P0-017、P0-018

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/contracts/ERROR_CODES.md`

## 主要影响范围

- `packages/editor-core/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 实现块锁定/解锁命令与Revision校验。
2. 实现Tiptap锁定扩展，阻止输入、删除、移动和合并。
3. 实现Core LockGuard，覆盖源块及受合并影响的相邻块。
4. 统一返回锁定冲突和跳过摘要。
5. 锁定状态在基础主题和来源模式下低干扰可识别。

## 测试与证据

- 锁定更新、删除、移动、拆分、合并和批量Patch。
- 绕过Editor直接调用Core仍被拒绝。
- 锁定状态在重启后保持。

证据保存到：`docs/test-evidence/M2-01/`

## 完成条件

- 锁定块破坏率为0。
- 后续AI、替换和结构操作只能复用LockGuard。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
