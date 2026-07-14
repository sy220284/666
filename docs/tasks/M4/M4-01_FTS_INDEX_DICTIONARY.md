# M4-01 FTS5公共索引、队列与项目词典

> 状态：Planned  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 建议分支：`feat/m4-fts-index-dictionary`

## 目标

建立AI约束召回和用户全项目搜索共用的FTS5基础，不重复建设索引逻辑。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不实现最终搜索页面和批量替换事务。
- 不引入向量数据库。

## 依赖

M3

## 关联

- 需求：REQ-025、REQ-032、REQ-033
- 功能ID：SRC-002、AI-003、SRC-003基础
- 验收：P0-046、P0-047基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `migrations/project/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/performance/`

## 实施内容

1. 检测当前SQLite是否支持FTS5 trigram；不支持时按DEC-006进入明确评审。
2. 建立Draft、Version、Entity和ResearchNote索引。
3. 业务事务后写显式索引队列，失败标记stale而不回滚正文。
4. 支持索引状态、增量更新、完整重建和删除后重建。
5. 短于3字符查询走标准化LIKE、精确别名或短词索引。
6. 实现项目词典：专名、别名、忽略、替换建议和类别。

## 测试与证据

- 中文短词、长短语、别名、索引损坏、stale和重建。
- 百万字Fixture查询和重建记录性能。
- 搜索结果只返回业务ID并回读权威数据。

证据保存到：`docs/test-evidence/M4-01/`

## 完成条件

- FTS为可重建派生数据。
- 约束包和用户搜索复用同一索引服务。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
