# M2-03 Diff、冲突、采用与持久化撤销

> 状态：Planned  
> 里程碑：M2 编辑安全与版本核心  
> 优先级：P0  
> 建议分支：`feat/m2-diff-apply-conflict-undo`

## 目标

完成Fixture Candidate与当前Draft之间的结构Diff、冲突处理、原子采用和重启后回退。

## 阶段定位

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

## 非目标

- 不实现AI生成。
- 不完成最终视觉审阅工作台。

## 依赖

M2-02

## 关联

- 需求：REQ-013、REQ-029
- 功能ID：CND-002、CND-003、CND-004
- 验收：P0-029—P0-032

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `packages/editor-core/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`
- `tests/performance/`

## 实施内容

1. 实现logicalBlockId结构Diff和中文字符Diff生产算法。
2. 动态计算新增、删除、移动、拆分、合并和修改，不把diffType存为权威数据。
3. 实现整稿、块级和SceneBeat级选择映射基础。
4. 提交前校验项目、状态、完整度、baseRevision、expectedHash和LockGuard。
5. 单事务应用Patch、Revision+1并创建ApplyRecord和Checkpoint。
6. 支持即时整体撤销和重启后回退预览。
7. 冲突进入ConflictSet，不用普通Toast代替。

## 测试与证据

- 旧Revision、Hash变化、锁定、缺失块、结构冲突和重复采用。
- 5000字Diff首屏≤500ms、完整≤1.2s。
- 采用事务故障回滚，撤销后正文逐块一致。

证据保存到：`docs/test-evidence/M2-03/`

## 完成条件

- Candidate采用无静默覆盖且可审计、可撤销。
- 所有采用路径复用Block Patch和LockGuard。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
