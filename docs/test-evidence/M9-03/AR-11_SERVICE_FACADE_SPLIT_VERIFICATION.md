# AR-11 ServiceFacade 拆分验证

- 工作包：`M9-03 / AR-11`
- 验证对象：`StateProposalService`、`GenerationRunService`
- 原子落盘提交：`f86e2e6eafebafcdb476d8a3b967f98aae899ac8`
- 环依赖修复提交：`ee29a045492062983198c21d7cb8f35f5968a603`
- Quality Run：`30731337940`
- 结论：通过

## 1. 拆分结果

### State Proposal

兼容入口 `packages/core-service/src/state-proposal.ts` 仅保留公开重导出，生产实现收敛到：

- `state/state-proposal-service.ts`：公开Facade与上下文装配。
- `state/proposal-batch-repository.ts`：提案批次、生成、Provider完成、解析与状态提交。
- `state/ending-snapshot-service.ts`：结局快照读取、刷新与历史状态投影。
- `state/derived-invalidation-service.ts`：派生失效范围计算与持久化。
- `state/state-row-mappers.ts`：共享行类型、映射、权限断言与错误模型。

### Generation Run

兼容入口 `packages/core-service/src/generation-run.ts` 仅保留公开重导出，生产实现收敛到：

- `generation/generation-run-service.ts`：公开Facade与上下文装配。
- `generation/run-repository.ts`：Run生命周期、查询、状态迁移、Usage、取消、失败与恢复。
- `generation/candidate-persistence.ts`：Prose/Skeleton候选校验与持久化。
- `generation/partial-result-service.ts`：部分结果记录、保存与丢弃。
- `generation/model-support-repository.ts`：模型支持档案读取与写入。

本轮共原子写入12个生产文件，同时删除候选生成器、虚拟编译器、导出测试及6个载荷分片。分支未暴露半成品生产状态。

## 2. 边界与编译验证

- 12个候选模块在生产落盘前完成独立TypeScript虚拟编译，诊断数为`0`。
- 候选制品SHA-256：`eb8c115111a2df361de86d9d1f22f6f7bba61ba8a852d47f94bb1b6585a6d8ce`。
- 生产落盘后发现并修复两组State内部环依赖：
  - `ending-snapshot-service ↔ proposal-batch-repository`
  - `proposal-batch-repository ↔ state-row-mappers`
- 共享权限断言与类型下沉后，`check:boundaries`通过；未增加循环依赖白名单。
- Workspace TypeScript、格式、Lint、架构边界及Build全部通过。

## 3. 事务与故障路径

### State Proposal

`tests/unit/state-proposal.test.ts`覆盖：

- 提案生成、Provider批次完成、接受、编辑接受、拒绝与批次状态刷新。
- 重复目标、失效Version、非法证据、非法权限、里程碑依赖未满足及并发状态漂移。
- EntityState与ArcMilestone写入、EndingSnapshot刷新、DerivedInvalidation传播。
- 失败发生在`writeProject`事务内时不保留半提交批次、状态或派生记录。

### Generation Run

`tests/unit/generation-run.test.ts`覆盖：

- Run创建与幂等、约束包和输入源固化、状态迁移与Usage更新。
- Draft基线漂移、候选来源越界、重复/非法候选、Skeleton约束缺失。
- Prose/Skeleton完成、部分结果记录、保存、丢弃、取消、失败、恢复与继续生成边界。
- ModelSupport读取/写入及无效持久化档案。
- 失败发生在`writeProject`事务内时不保留候选、结果引用或终态的部分提交。

## 4. 门禁结果

当前Head `ee29a045492062983198c21d7cb8f35f5968a603` 对应Quality Run `30731337940`：

- Static Analysis：通过。
- Build：通过。
- Unit Tests：通过。
- Integration Tests：通过。
- Coverage：通过。
- Electron E2E：通过。
- Security、Performance、Evidence、Governance及PR Policy：通过。

## 5. 闭环判定

AR-11满足以下验收条件：

- 两个巨型ServiceFacade均拆分为清晰执行子域。
- 兼容入口保留，公开API与调用侧无需迁移。
- 生产编译、边界、事务、故障路径、Unit、Coverage及Electron E2E全部通过。
- 无候选生成脚手架、临时载荷或半成品文件残留。
- PR #273继续保持Draft；本证据不构成Ready、合并或发布授权。
