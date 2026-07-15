# M0-03 SQLite、Migration与单写队列

> 状态：In Progress
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 工作分支：`main`（作者预授权连续主线模式）

## 目标

建立app.sqlite与project.sqlite的数据底座、Migration框架、完整性检查和串行写入机制。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不一次创建全部V1业务表。
- 不实现项目页面和编辑器。

## 依赖

M0-01

## 关联

- 需求：REQ-005、REQ-006
- 功能ID：无
- 验收：P0-006、P0-007、P0-012

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/decisions/ADR-002-sqlite-source-of-truth.md`

## 主要影响范围

- `packages/core-service/`
- `packages/contracts/`
- `packages/testkit/`
- `migrations/app/`
- `migrations/project/`
- `tests/migration/`
- `tests/integration/`

## 实施内容

1. 封装AppDatabase与ProjectDatabase连接，明确应用级和项目级数据边界。
2. 初始化WAL、foreign_keys、busy_timeout=5000、synchronous=NORMAL。
3. 建立单写队列、只读查询通道、事务包装和关闭排空机制。
4. 建立Migration Runner、schema_migrations、checksum和追加式版本策略。
5. 建立requestId幂等结果基础，重复写命令不重复提交。
6. 提供quick_check、integrity_check、foreign_key_check和WAL checkpoint接口。
7. 建立高版本Schema只读打开策略和Migration故障注入点。

## 测试与证据

- 100轮并发写入无丢写、无重复写和无SQLITE_BUSY直接泄露。
- 重复requestId返回原结果，事务中断完整回滚。
- Migration重复执行、中断、checksum异常和高版本Schema行为正确。
- 故障后数据库可重新打开且无半提交状态。

证据保存到：`docs/test-evidence/M0-03/`

## 完成条件

- 数据库参数、写队列、Migration、幂等与完整性接口全部有测试证据。
- app.sqlite不保存正文，Renderer无数据库访问路径。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
