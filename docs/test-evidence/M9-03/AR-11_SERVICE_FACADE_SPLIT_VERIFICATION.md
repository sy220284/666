# AR-11 State Proposal与Generation拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-11
- PR：#273
- 基线main：`e80552afec44916cc3821e933fc477badbad178a`
- 原子落盘提交：`f86e2e6eafebafcdb476d8a3b967f98aae899ac8`
- 共享边界整改：
  - `1cae14a93db81239945377a133e80329ba6f5060`
  - `7236d545530b5a56b2375030e75989b429493385`
- 最终受检Head：`d677b16d5412f39c55c15fada1080fdfb4971d3c`
- Quality Run：`30732849190`
- Security Run：`30732849116`
- Performance Run：`30732849143`
- Evidence Run：`30732849188`
- Task Governance Run：`30732849122`
- PR Policy Run：`30732849127`
- 结果：AR-11实现、边界整改与完整PR质量矩阵通过。

## 2. 结构结果

### State Proposal

兼容入口`packages/core-service/src/state-proposal.ts`保留公开重导出，内部拆分为：

```text
packages/core-service/src/state/
├─ state-proposal-service.ts
├─ proposal-batch-repository.ts
├─ ending-snapshot-service.ts
├─ derived-invalidation-service.ts
└─ state-row-mappers.ts
```

### Generation

兼容入口`packages/core-service/src/generation-run.ts`保留公开重导出，内部拆分为：

```text
packages/core-service/src/generation/
├─ generation-run-service.ts
├─ run-repository.ts
├─ candidate-persistence.ts
├─ partial-result-service.ts
└─ model-support-repository.ts
```

公开Facade类名、构造方式、方法签名和根导出路径保持兼容。V1.5可直接依赖快照、派生失效、Run仓储、候选持久化、部分结果和模型支持边界，不再向两个巨型Facade继续追加实现。

## 3. 问题发现与真实整改

生产落盘后的Quality Run `30731035294`发现两组真实环依赖：

- `ending-snapshot-service.ts → proposal-batch-repository.ts → ending-snapshot-service.ts`
- `proposal-batch-repository.ts → state-row-mappers.ts → proposal-batch-repository.ts`

整改方式：

- `ProposalDraft`改由`state-row-mappers.ts`直接从Contracts推导。
- 作者权限断言下沉至共享状态层。
- `ending-snapshot-service.ts`不再反向依赖提案仓储。
- 未增加循环依赖白名单、结构债务豁免或Coverage排除。

前一版证据曾错误记录不存在的提交`ee29a045492062983198c21d7cb8f35f5968a603`并据此宣告通过。该记录已撤回；本文件只承认仓库中实际存在的提交和最终成功工作流。

## 4. 行为与事务边界

专项及既有测试确认：

- 作者裁决权限边界保持不变，AI不能直接接受、编辑接受或刷新权威派生状态。
- EndingSnapshot仍只接受章节当前定稿Version，历史状态投影与Fallback读取保持一致。
- 提案生成、Provider完成、重复目标、无效证据、依赖未满足及批次状态更新保持原子。
- 派生失效范围、目标章节和队列记录保持不变。
- Generation Run的T0、T1、改写、融合、状态提取、取消、失败、恢复和Usage更新保持不变。
- Prose与Skeleton候选继续校验Draft基线、来源映射、内容Hash和约束指纹。
- 部分结果保存、丢弃、继续生成上下文及终态限制保持不变。
- 模型支持档案的未验证降级、持久化解析和无效档案拒绝保持不变。
- 事务或校验失败时，候选、提案、结果引用、快照及Run终态不会部分提交。

## 5. 自动验证

最终受检Head `d677b16d5412f39c55c15fada1080fdfb4971d3c`：

```text
Evidence             PASS
Task Governance      PASS
PR Policy            PASS
Security             PASS
Performance          PASS
Workspace             PASS
Boundaries            PASS
Format                PASS
Lint                  PASS
Typecheck             PASS
Unit                  PASS
Integration           PASS
Migration             PASS
Coverage              PASS
Build                 PASS
Electron E2E          PASS
Quality aggregate     PASS
```

Coverage：

```text
测试文件     234 / 234通过
测试数量     1027 / 1027通过
Statements   84.76%
Branches     75.01%
Functions    84.98%
Lines        86.85%
```

仓库结构检查覆盖329个源码文件、972条相对导入边及15项已登记结构债务；本次未新增循环依赖或结构债务。

## 6. 回退

AR-11未修改数据库Schema、Migration、IPC协议或公开Facade表面。若后续发现状态事务、快照来源、派生失效、Generation终态或模型支持行为回归，应整体回退：

1. 恢复`state-proposal.ts`与`generation-run.ts`至AR-10检查点。
2. 删除`state/`与`generation/`新增内部模块。
3. 恢复拆分前专项测试定位。
4. 重新运行Static、Unit、Integration、Migration、Security、Coverage、Build和Electron E2E。

## 7. 结论

AR-11满足冻结工作包要求，可以将M9-03活动检查点切换至AR-12。PR #273继续保持Draft；AR-12—AR-14全部完成前不得转Ready或合并。
