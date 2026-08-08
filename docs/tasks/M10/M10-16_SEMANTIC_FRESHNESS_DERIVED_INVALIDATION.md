# M10-16 语义新鲜度与派生失效一致性收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 跨域语义与运行一致性收口  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`960f0ee94069b40c84e546486dd4d3dd9f630adf`  
> 实现提交：`b58938188282783047628849eda637b209b44925`

## 目标

统一 Final Version 变化、语义状态变化与 Validation / StateProposal / EndingSnapshot 等派生结果的新鲜度语义，消除“正文未变但语义图已变化时旧校验仍被视为当前”“旧 Final 生成的 pending Proposal 无法安全拒绝”“Snapshot stale 同时由 Trigger 与 Service 写入”的双所有权与僵尸结果问题。

## 阶段定位

承接已有效 Verified 的 M10-15。M10-15 解决 AI 权威上下文、Flush 后 Draft、时序 provenance 与历史实体引用；本任务继续补齐 `Authority Context → Freshness → Derived Invalidation` 链路。完成并闭环后才允许启动 M10-17。

## 非目标

- 不重写 SQLite、ProjectWorkspace 单写队列、Version/Candidate/GenerationRun/Recovery/Provider 内核。
- 不新建第二套 EndingSnapshot 状态机；Snapshot stale 继续由既有数据库 Trigger 独占。
- 不修改已发布 Migration、StateProposal 持久化 status enum 或历史 Evidence。
- 不降低 Coverage、安全、性能、E2E 或格式门禁。
- 不提前实施 M10-17 ProjectTaskBarrier、Planning/Rhythm/Startup 生命周期治理或 M10-18 Import/Entity Delete/Arc 依赖重构。

## 依赖

- M10-15 有效状态必须为 VERIFIED。
- 当前 `main-verification=success`。
- `main == work` 且不存在开放的 `work → main` PR 后启动。

## 真实承接基线

- `main = work = 960f0ee94069b40c84e546486dd4d3dd9f630adf`。
- PR #324 已 Squash Merge，`main-verification` 与 `task-verification/M10-15` 均成功。
- M10-15 Work Synchronization 已按 verified-reset 条件恢复并复核 ahead/behind 为 0/0。

## 关联

- 问题：P1-06、P1-10、P1-12。
- 主题：Semantic Freshness、Derived Invalidation、StateProposal stale、Validation semantic fingerprint。
- 验收：语义状态或 SceneBeat 图变化即使正文 Hash 不变，也不得继续把旧派生结果冒充当前。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/tasks/M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md`
- `docs/tasks/M6/M6-01_RULE_STATUS_VALIDATION_TODOS.md`
- `docs/tasks/M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/process/WORKFLOW_EXECUTION_ORDER.md`
- `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`

## 主要影响范围

- `packages/contracts/src/state-proposal.ts`
- `packages/contracts/src/validation.ts`
- `packages/core-service/src/state/derived-invalidation-service.ts`
- `packages/core-service/src/state/proposal-batch-repository.ts`
- `packages/core-service/src/state/state-row-mappers.ts`
- `packages/core-service/src/validation/validation-model.ts`
- `packages/core-service/src/validation/validation-catalog.ts`
- `packages/core-service/src/validation/validation-rule-operations.ts`
- 必要的权威 Timeline / Foreshadowing / Arc / StateProposal 写 Use Case
- StateProposal / Validation Renderer 展示边界
- 对应 Unit / Integration / Security / E2E 回归测试
- 当前任务 Runtime、TASK_INDEX 与 Evidence

## 职责、状态所有权与依赖方向

1. 数据库 Trigger 是 EndingSnapshot stale 的唯一写入所有者；Core Service 不再平行更新 `ending_snapshots.status`。
2. `derived_invalidations` 作为语义失效 Ledger，提供事务内公共 `recordDerivedInvalidation(...)` 能力；具备合法 Final Version 锚点的语义写 Use Case 在同一 SQLite 事务记录失效事实。
3. 无合法 `sourceVersionId` 的直接领域编辑不伪造版本锚点；Validation 通过权威领域状态摘要计算 semantic freshness。
4. StateProposal 持久化状态继续只保存 `pending/accepted/edited/rejected`；`freshness` 与 `actionability` 由当前 Final 身份计算，不新增僵尸状态枚举。
5. Validation 的正文锚点新鲜度与语义新鲜度分离计算；缓存命中必须同时满足正文/结构语义指纹。
6. Renderer 仅展示计算状态与阻断不可执行动作，不拥有 freshness 真源。

## 数据库与Migration

- 已发布 Migration 冻结。
- 不新增 Snapshot invalidation Service 状态。
- 复用现有 `derived_invalidations` Ledger，不改 Schema。
- 有合法 Final 锚点的 Ledger 写入必须与对应权威语义写处于同一 `writeProject` 事务。
- 不为 Timeline/Foreshadowing 等无合法 Final 锚点的直接编辑伪造 `source_version_id`。

## IPC、事件与错误码

- 优先扩展现有 StateProposal / Validation Contract 返回语义，不建立平行 IPC。
- stale StateProposal：Reject 允许；Accept / Edit-Accept 返回稳定冲突语义。
- Validation list 区分 anchor freshness 与 semantic freshness。

## UI闭环

- stale Proposal 明确显示“来源定稿已变化”，Accept / Edit-Accept 禁用，Reject 保留。
- Validation 结果在正文锚点仍 current、但语义失效时明确显示 semantic stale，不继续表现为当前结果。

## 安全、隐私与恢复

- 不增加外部网络、云存储或凭据表面。
- Ledger 与 freshness 只读取/写入本地 Project SQLite。
- 不通过删除历史 Proposal/Validation 记录伪造 freshness；保留审计历史。

## 性能预算

- freshness 计算避免逐 Issue 的无界 N+1；Catalog 在单次请求内缓存项目权威语义摘要、章节 invalidation digest 与 SceneBeat/Version 摘要。
- Semantic fingerprint 使用确定性摘要，不把完整正文或大图重复写入数据库。

## 已实施内容

1. 移除 `DerivedInvalidationService` 与 `snapshotRow()` 对 EndingSnapshot stale 的平行写入，保留既有 DB Trigger 唯一所有权。
2. 提取事务内 `recordDerivedInvalidation(...)`；StateProposal 采纳与合法 Final 锚点的权威语义写入同事务登记 Ledger。
3. StateProposal Catalog 增加计算型 freshness/actionability；旧 Final Proposal 可 Reject，不可 Accept/Edit-Accept。
4. Rule Validation fingerprint 纳入 Final/Block、SceneBeat graph/mapping/entity relationships、rule/config、semantic invalidation 与权威领域状态摘要。
5. AI Validation 绑定 ConstraintPackage hash、Prompt ID/version 与同一 semantic identity；运行期间语义状态发生变化时批次直接判 semantic stale。
6. Validation Catalog 对语义摘要做请求内缓存，避免历史 Batch 数量放大全项目扫描。
7. Renderer 同时显示 Proposal freshness/actionability 与 Validation anchor/semantic freshness。
8. 新增 Final V1→V2、SceneBeat-only、EntityState、AI 运行期竞态、Snapshot Trigger 单一所有权等永久 Integration 回归。

## 自动化测试

- Snapshot stale 只由现有 DB Trigger 产生，Service 不直接 UPDATE `ending_snapshots`。
- StateProposal 来源 Final V1 被 V2 替代后显示 `freshness=stale`，Reject 成功，Accept/Edit-Accept 冲突。
- StateProposal 采纳在同一事务写入对应 Derived Invalidation Ledger。
- SceneBeat 图或映射变化、正文 Hash 不变时 Rule Validation fingerprint 改变并重算。
- Semantic Ledger 或权威领域状态变化后旧 Validation 显示 semantic stale；锚点 freshness 独立计算。
- AI Validation 的 Constraint/Prompt/semantic identity 参与 freshness 判断；模型运行期间语义变化时结果落库即 stale。
- 既有 StateProposal、EndingSnapshot、Validation、GenerationRun 回归保持通过。

## 人工验收

- Final V1 生成 Proposal 后改定稿为 V2：旧 Proposal 仍可查看/拒绝，但不可采纳。
- 修改 SceneBeat 而不改正文：原 Validation 立即表现为语义陈旧，重新运行产生新结果。
- 修改实体状态/伏笔/时间线/人物弧光后：相关校验不继续显示为 current。

## Evidence

保存到：`docs/test-evidence/M10-16/`

## 回滚策略

整体回退 M10-16 实现与 Contract/UI 扩展；不回滚 Migration。回退后恢复 M10-15 已验证主线语义。

## 完成条件

- [x] Snapshot stale 单一所有权恢复为 DB Trigger。
- [x] Derived Invalidation Ledger 与权威语义摘要形成统一 freshness 机制。
- [x] StateProposal stale/actionability 闭环并保留 Reject。
- [x] Rule / AI Validation 建立可计算 semantic freshness。
- [ ] 对应 Unit / Integration / Coverage / Security / Performance / Build / Electron E2E 全绿。
- [ ] Ready Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-16` 成功。
- [ ] `work` 受控同步到已验证 `main`。
