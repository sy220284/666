# M10-21 当前权威文档与测试架构现代化

> 状态：Implemented
> 里程碑：M10 稳定性与治理续作
> 优先级：P1
> 执行分支：`work`
> 目标分支：`main`
> 主线基线：`5e2564755ce01966849fc47024cd83b81c649dfc`

## 目标

消除 M10-19 后确认的当前权威设计漂移与测试架构维护债，使产品规格、Schema、数据流、IPC、验收追踪和测试基础设施重新表达同一套真实不变量。任务不新增产品功能、不修改生产实现、不改写已发布 Migration 或历史 Evidence。

## 审计输入

本任务承接 14 类已复核问题：

1. 8 类必须更新的当前权威设计：Full Spec、Database Schema、Data Dictionary、Data Flow、IPC Contracts、Test Strategy、P0 Acceptance Matrix、V1.0 Traceability Matrix。
2. 2 类建议同步的当前设计：UI Interaction States、Architecture。
3. 3 类必须治理的测试架构：latest schema 硬编码、历史 Migration 从最新库倒拆、AR 固定行数硬门。
4. 1 类建议现代化的测试：M10-13 源码字符串实现形态断言。

## 权威语义

- `GenerationRun` 是生成业务生命周期的持久权威；`TaskProtocol/TaskSnapshot` 是运行态、进度与事件投影。
- 写命令普遍具备进程生命周期内有界幂等；跨 Core 重启的 durable replay 必须按命令声明，可能由领域持久日志或 `command_receipts` 提供。
- Arc 作者操作与 StateProposal 接受复用同一依赖策略；TimelineEvent 依赖要求事件 active、存在章节锚点且不晚于实际命中章节。
- Replace Apply 重新校验 Chapter、父 Volume 与 Active Draft；实体永久删除由真实 SQLite `RESTRICT/NO ACTION` FK metadata 裁决。
- degraded 状态可以保留最后可信数据，但必须显式提示当前读取失败和数据可能过期。

## 实施范围

### A. Migration 测试基础设施

- 在 Testkit 提供动态读取最新 Project Migration 版本、按目标版本筛选及正向物化历史 Migration 目录的公共能力。
- 8 个历史 Migration 测试不再复制 latest schema 数字。
- Schema 27 fixture 从 Migration 1 正向执行到 27，不再由最新 Schema 删除表、Trigger 和记录来伪造。

### B. 结构与行为测试

- 删除 7 个 AR 测试中的固定文件行数 hard fail。
- 保留循环依赖、依赖方向、状态 Owner、组合根、Feature 私有边界和禁止能力等结构语义检查。
- 将 M10-13 中锁定函数名、语句顺序或字面源码的高风险断言迁移为行为、公开接口或稳定边界断言；安全不存在性扫描继续保留。

### C. 当前权威文档

- 同步 Full Spec、Schema、Dictionary、Data Flow、IPC、Test Strategy。
- 为 P0-001—075 增加 M10 Maintenance Acceptance Addendum，不重编号历史条目。
- 更新 Traceability 的任务规模、维护链与 M10-19 后不变量映射。
- 补充 Architecture 生命周期 Owner 与 UI degraded retained-data 语义。

## 非目标与冻结边界

- 不新增功能、Schema、Migration、IPC method、错误码或依赖。
- 不修改生产代码以迎合测试。
- 不改写已 Verified 的任务卡、Runtime、Migration 和 Evidence。
- 不把文件行数、函数数量、导出数量重新设为合并硬门。
- 不删除有效的安全边界不存在性扫描。

## 验收

- 仓库不存在历史 Migration 测试复制当前 latest schema 数字的维护点。
- 历史 Project Schema fixture 只由 Migration 序列正向构建。
- AR 测试不再以固定行数决定通过或失败，结构不变量仍有自动化证明。
- M10-13 目标测试不锁定私有函数名称或语句相对位置。
- 10 份当前权威文档与 M10-19 后真实实现一致，IPC durable replay 能力边界没有过度承诺。
- 专项测试、Runtime 全量验证矩阵和 clean-tree 复核真实完成。

## 验证

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
```

## 回滚

整体回退 M10-21 的 Testkit、测试、当前权威文档、任务卡、Runtime、索引和 Evidence；不触碰 M10-20 及更早已验证实现和历史记录。

## 完成条件

- [x] 任务 Runtime、任务卡和索引授权建立。
- [x] Migration 测试基础设施与 8 个历史测试完成治理。
- [x] 7 个 AR 行数硬门移除且结构语义检查保留。
- [x] 4 个 M10-13 高风险源码实现断言完成现代化。
- [x] 10 份当前权威文档同步完成。
- [x] 专项与完整验证矩阵通过，Evidence 绑定最终实现提交。
- [ ] Controlled Merge、Main Verification 与 Work Synchronization 完成。
