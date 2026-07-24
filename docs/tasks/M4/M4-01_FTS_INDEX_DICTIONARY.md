# M4-01 FTS5公共索引、队列与项目词典

> 状态：Implemented  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 工作分支：`work/m4-01-fts-index-dictionary`

## 目标

建立AI约束召回和用户全项目搜索共用的FTS5基础，不重复建设索引逻辑。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不实现最终搜索页面和批量替换事务。
- 不引入向量数据库。
- 根据DEC-018，不为尚未进入V1 P0数据模型的ResearchNote预建业务表或索引。
- 不在SQLite触发器中拼装全文、计算摘要或维护业务投影。

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
- `tests/integration/`
- `tests/migration/`
- `tests/performance/`

## 实施内容

1. 以Schema 20建立Draft、Version、Entity三类FTS5 trigram派生索引、索引状态与显式目标队列。
2. SQLite触发器只记录受影响的业务ID；Core负责读取权威数据、组装全文和消费队列。
3. 所有正文、Version、Entity、CanonFact及卷章可见性变更统一使索引进入stale；索引失败不回滚业务事务。
4. 支持增量消费、失败重试、完整重建、索引损坏恢复和删除清理。
5. FTS只召回业务ID；每条结果必须回读当前项目内的权威业务数据，禁止跨项目泄漏和直接展示派生表内容。
6. 三字符及以上查询在索引ready时走FTS；短词或stale状态走标准化权威LIKE查询。
7. 以Schema 21实现作者管理的项目词典：专名、别名、忽略、替换建议和类别；AI无权写入。

## 测试与证据

- 中文短词、长短语、别名、权威回读、跨项目隔离、索引损坏、stale、失败重试和重建。
- Schema 20—21连续迁移、FTS5 trigram、显式队列触发器和严格项目词典。
- 150万字符Fixture查询P95不超过200ms，并记录完整重建耗时。
- 搜索结果仅通过业务ID召回并回读权威数据。

证据保存到：`docs/test-evidence/M4-01/`

## 实现收口

- Schema 20—21、Core搜索服务、公共合同、迁移、集成与性能测试已形成完整实现。
- Quality运行`30088007101`通过静态、构建、单元、集成、迁移、覆盖率与Electron E2E。
- Security运行`30088006972`、Performance运行`30088006958`、PR Policy运行`30088006973`与Evidence运行`30088006985`均成功。
- 1,563,300字符性能Fixture完整重建耗时202.16ms，30次查询P95为14.12ms；覆盖率为Lines 86.55%、Statements 84.28%、Functions 84.87%、Branches 75.30%。
- 最终搜索页面与安全批量替换继续由M6-03实现；M4-01不提前引入该范围。

## 完成条件

- FTS为可删除、可重建的派生数据。
- 权威业务事务不依赖索引成功，索引失败只进入stale并可重试。
- 约束包和用户搜索复用同一索引服务。
- Quality、Security、Performance、Evidence、Task Governance和PR Policy全部通过。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`、`DATABASE_SCHEMA.md`及测试证据。
