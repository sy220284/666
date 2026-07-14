# M6-03 全项目搜索与安全批量替换

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-project-search-safe-replace`

## 目标

完成正文、Version、实体和笔记的全项目中文搜索及可预览、可恢复的批量替换。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不改变当前章普通查找的轻量路径。

## 依赖

M4-01、M2-01、M1-08

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

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`
- `tests/performance/`

## 实施内容

1. 实现搜索范围、来源、分页、索引状态和短词回退。
2. SearchResult生成ReplacePlan，展示命中锚点、目标Revision/Hash和锁定状态。
3. 提交前创建恢复点并重新校验Revision、Hash和LockGuard。
4. 锁定块默认跳过，结果显示摘要。
5. 单事务提交替换Patch，失败完整回滚。
6. 项目词典提供专名、忽略和替换建议。

## 测试与证据

- 中文短词、别名、索引损坏、重建和大项目性能。
- ReplacePlan过期、锁定、事务失败和恢复点。
- 搜索结果来自权威业务数据。

证据保存到：`docs/test-evidence/M6-03/`

## 完成条件

- 批量替换无静默覆盖且可通过恢复点撤销。
- 搜索索引可重建。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
