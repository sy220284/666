# AR-11 ServiceFacade 拆分复验记录

- 工作包：`M9-03 / AR-11`
- 验证对象：`StateProposalService`、`GenerationRunService`
- 原子落盘提交：`f86e2e6eafebafcdb476d8a3b967f98aae899ac8`
- 共享类型与权限断言下沉：`1cae14a93db81239945377a133e80329ba6f5060`
- 快照反向依赖移除：`7236d545530b5a56b2375030e75989b429493385`
- 当前状态：复验中，尚未闭环

## 1. 拆分结果

### State Proposal

兼容入口 `packages/core-service/src/state-proposal.ts` 保留公开重导出，生产实现拆分为：

- `state/state-proposal-service.ts`：公开Facade与上下文装配。
- `state/proposal-batch-repository.ts`：提案批次、生成、Provider完成、解析与状态提交。
- `state/ending-snapshot-service.ts`：结局快照读取、刷新与历史状态投影。
- `state/derived-invalidation-service.ts`：派生失效范围计算与持久化。
- `state/state-row-mappers.ts`：共享行类型、映射、权限断言与错误模型。

### Generation Run

兼容入口 `packages/core-service/src/generation-run.ts` 保留公开重导出，生产实现拆分为：

- `generation/generation-run-service.ts`：公开Facade与上下文装配。
- `generation/run-repository.ts`：Run生命周期、查询、状态迁移、Usage、取消、失败与恢复。
- `generation/candidate-persistence.ts`：Prose/Skeleton候选校验与持久化。
- `generation/partial-result-service.ts`：部分结果记录、保存与丢弃。
- `generation/model-support-repository.ts`：模型支持档案读取与写入。

## 2. 已发现并整改的问题

生产落盘提交`f86e2e6e`后的Quality Run `30731035294`在`check:boundaries`发现两组真实环依赖：

- `ending-snapshot-service.ts → proposal-batch-repository.ts → ending-snapshot-service.ts`
- `proposal-batch-repository.ts → state-row-mappers.ts → proposal-batch-repository.ts`

前一版证据错误记录了不存在的提交`ee29a045492062983198c21d7cb8f35f5968a603`，并据此将AR-11标记为通过。该结论已撤回。

实际整改为：

- `state-row-mappers.ts`直接从Contracts定义`ProposalDraft`，不再反向导入提案仓储。
- 作者权限断言下沉到`state-row-mappers.ts`，`ending-snapshot-service.ts`不再导入提案仓储。
- 未增加循环依赖白名单或结构债务豁免。

## 3. 事务与故障覆盖基线

现有测试继续覆盖：

- State Proposal的提案生成、Provider完成、作者裁决、快照刷新、派生失效及事务回滚。
- Generation Run的Run生命周期、候选持久化、部分结果、模型支持、基线漂移及事务回滚。
- Project Workspace安全矩阵与其他既有回归测试不因本次内部依赖整改而调整。

## 4. 待完成复验

当前整改Head必须重新取得以下结果后，AR-11才能恢复为闭环：

- `check:boundaries`零环依赖。
- Format、Lint、Typecheck、Build全部通过。
- Unit、Integration、Migration、Coverage全部通过。
- Electron E2E、Security、Performance、Evidence、Governance及PR Policy全部通过。
- 证据Manifest完整性校验通过。

PR #273继续保持Draft；本记录不构成AR-11完成、Ready、合并或发布授权。
