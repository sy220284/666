# M6-03 全项目搜索与安全批量替换

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-03-project-search-safe-replace`

## 目标

完成Draft、Version和Entity的全项目中文搜索，以及仅针对活动DraftBlock的可预览、可恢复安全批量替换。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。搜索范围与可替换范围必须明确分离。

## 非目标

- 不改变当前章普通查找的轻量路径。
- 不搜索或预建V1范围外的ResearchNote、项目日记或附件。
- 不修改不可变Version。
- 不通过通用正文替换事务修改Entity或Canon。

## 依赖

M4-01、M2-01、M1-08

## 承接基线

- 复用M4-01 FTS、索引状态、短词回退、权威回读和项目词典。
- 复用M2-01 Revision、Hash与LockGuard。
- 复用M1-08恢复点和恢复到新副本能力。
- 复用现有Draft Patch单事务入口，不建立批量替换专属正文真源。

## 关联

- 需求：REQ-032、REQ-033
- 功能ID：SRC-002、SRC-003
- 验收：P0-046、P0-047

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md`

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/performance/`

## 范围边界

```text
可搜索
├─ 活动Draft
├─ 历史Version（只读）
└─ Entity（跳转到设定工作台）

可批量替换
└─ 活动DraftBlock
```

## 实施内容

1. 实现搜索范围、来源、分页、索引状态、短词回退和权威结果回读。
2. Draft结果可进入ReplacePlan；Version结果仅查看和定位；Entity结果跳转对应设定编辑界面。
3. ReplacePlan只包含活动DraftBlock，展示命中锚点、目标Draft、Revision、Hash和锁定状态。
4. 提交前创建恢复点，并重新校验项目、Draft、Revision、Hash、命中内容和LockGuard。
5. 锁定块默认跳过并显示摘要；用户不得通过批量替换绕过锁定。
6. 替换通过标准Block Patch单事务提交，任一失败完整回滚。
7. Version保持不可变，任何通用ReplacePlan包含Version目标时必须拒绝。
8. Entity和Canon修改继续使用专用设定命令，不混入正文Patch事务。
9. 项目词典继续提供专名、别名、忽略和替换建议，AI无权修改。
10. StoryTodo、Comment、ResearchNote或附件未来需要搜索时，必须通过独立范围升级和追加索引任务实施。

## 测试与证据

- 中文短词、长词、别名、索引损坏、stale、重建和大项目性能。
- Draft、Version、Entity三类结果及权威回读。
- ReplacePlan过期、Revision/Hash变化、锁定、命中内容变化、事务失败和恢复点。
- Version替换拒绝、Entity通用替换拒绝和跨项目隔离。
- 搜索结果来自权威业务数据，索引表内容不直接展示。
- 批量替换失败不留下部分写入。

证据保存到：`docs/test-evidence/M6-03/`

## 完成条件

- 搜索覆盖Draft、Version和Entity，且不同对象拥有正确操作入口。
- 批量替换只作用于活动DraftBlock。
- Version和Entity通过通用ReplacePlan被修改的成功次数为0。
- 批量替换无静默覆盖且可通过恢复点撤销。
- 搜索索引可删除、可重建并继续复用M4-01。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全、性能或测试文档。
