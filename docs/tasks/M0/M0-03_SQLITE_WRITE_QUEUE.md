# M0-03 SQLite、Migration与单写队列

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m0-sqlite-write-queue`

## 目标

建立SQLite唯一数据真源、Migration框架、完整性检查和串行写入底座。

## 非目标

不一次实现全部业务表和页面。

## 依赖

M0-01。

## 关联

- 需求：REQ-005、REQ-006
- 验收：P0-006、P0-007、P0-012

## 必读文档

- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/decisions/ADR-002-sqlite-source-of-truth.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`

## 实施内容

1. 封装`app.sqlite`与`project.sqlite`连接。
2. 初始化PRAGMA：WAL、foreign_keys、busy_timeout、synchronous。
3. 建立串行写队列和只读查询通道。
4. 建立Migration Runner、`schema_migrations`和checksum。
5. 提供`quick_check`、`integrity_check`和`foreign_key_check`接口。
6. 建立requestId幂等基础。
7. 建立故障注入点。
8. 明确高版本Schema只读打开策略。

## 测试

- 100轮并发提交无丢写。
- 自动保存与AI保存模拟无`SQLITE_BUSY`直接泄露。
- 重复requestId不重复写入。
- 事务中断完整回滚。
- Migration中断、重复执行、checksum异常和高版本Schema处理正确。

## 完成条件

数据库参数、单写队列和Migration测试全部通过；故障后数据库可重新打开且无半提交状态。
