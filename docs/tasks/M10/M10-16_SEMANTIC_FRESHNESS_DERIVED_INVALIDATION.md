# M10-16 语义新鲜度与派生失效一致性收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 跨域语义与运行一致性收口  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`960f0ee94069b40c84e546486dd4d3dd9f630adf`  
> 最终产品实现提交：`aa722ef7a87ab746faf04a69520d7a3ef3bd37d1`

## 目标

统一 Final Version 变化、语义状态变化与 Validation / StateProposal / EndingSnapshot 等派生结果的新鲜度语义，消除正文未变但语义图已变化时旧校验仍被视为当前、旧 Final pending Proposal 无法安全拒绝、Snapshot stale 双所有权等问题。

## 阶段定位

承接已有效 Verified 的 M10-15，补齐 `Authority Context → Freshness → Derived Invalidation` 链路。完成 Controlled Merge、主线验证与 Work Synchronization 后，才允许启动 M10-17。

## 非目标

- 不重写 SQLite、ProjectWorkspace 单写队列、Version/Candidate/GenerationRun/Recovery/Provider 成熟内核。
- 不新建第二套 EndingSnapshot 状态机；Snapshot stale 继续由既有数据库 Trigger 独占。
- 不修改已发布 Migration、StateProposal 持久化 status enum 或历史 Evidence。
- 不降低 Coverage、安全、性能、E2E 或格式门禁。
- 不提前实施 M10-17 ProjectTaskBarrier、Planning/Rhythm/Startup 生命周期治理或 M10-18 Import/Entity Delete/Arc 依赖重构。

## 依赖与承接基线

- M10-15 有效状态为 VERIFIED。
- 启动基线：`main = work = 960f0ee94069b40c84e546486dd4d3dd9f630adf`。
- PR #324 已 Squash Merge，`main-verification` 与 `task-verification/M10-15` 均成功。
- M10-15 Work Synchronization 已恢复并复核 ahead/behind 为 0/0。

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
- `packages/core-service/src/generation/generation-run-service.ts`
- `packages/core-service/src/generation/run-command-identity.ts`
- `packages/core-service/src/state/derived-invalidation-service.ts`
- `packages/core-service/src/state/ending-snapshot-service.ts`
- `packages/core-service/src/state/proposal-batch-repository.ts`
- `packages/core-service/src/state/state-row-mappers.ts`
- `packages/core-service/src/validation/validation-model.ts`
- `packages/core-service/src/validation/validation-catalog.ts`
- `packages/core-service/src/validation/validation-rule-operations.ts`
- `apps/desktop/renderer/src/features/canon/state-proposal-panel.tsx`
- `apps/desktop/renderer/src/features/checks/checks-workbench.tsx`
- `apps/desktop/renderer/src/features/planning/outline/plot-tree.tsx`
- 对应 Integration 回归、Runtime、TASK_INDEX 与当前任务 Evidence。

## 职责、状态所有权与依赖方向

1. 数据库 Trigger 是 EndingSnapshot stale 的唯一写入所有者；Core Service 不平行更新 `ending_snapshots.status`。
2. `derived_invalidations` 是语义失效 Ledger；具备合法 Final Version 锚点的权威写 Use Case 在同一 SQLite 事务记录失效事实。
3. 无合法 `sourceVersionId` 的直接领域编辑不伪造版本锚点；Validation 通过权威领域状态摘要计算 semantic freshness。
4. StateProposal 持久化状态继续只保存 `pending/accepted/edited/rejected`；`freshness` 与 `actionability` 由当前 Final 身份计算。
5. Validation 的正文锚点新鲜度与语义新鲜度分离计算；缓存命中同时满足正文与结构/领域语义身份。
6. Validate GenerationRun 在模型调用前把 semantic identity 写入既有 Version input-source metadata；Catalog 与当前 identity 比较，不使用跨时钟时间戳推断先后。
7. requestId replay 比较原命令时剥离内部 semantic metadata key，保持命令身份稳定。
8. Renderer 只展示计算状态与阻断不可执行动作，不拥有 freshness 真源。
9. freshness 辅助 Zod Schema 保持模块私有，不扩张 AR-08 冻结的 `@worldforge/contracts` 根运行时公共面。

## 数据库与 Migration

- 已发布 Migration 冻结；本任务不新增 Migration/Schema。
- Snapshot stale 继续由 Migration 18/19 既有 Trigger 独占。
- `EndingSnapshotSchema` 接受既有 Final-change Trigger 写入的 `validation` stale reason；`DerivedInvalidation.changeType` 不扩大。
- 有合法 Final 锚点的 Ledger 写入与对应权威语义写处于同一 `writeProject` 事务。
- 不为 Timeline/Foreshadowing 等无合法 Final 锚点的直接编辑伪造 `source_version_id`。

## IPC 与 UI 闭环

- stale StateProposal：Reject 允许；Accept / Edit-Accept 稳定冲突。
- Validation list 区分 `anchorFreshness` 与 `semanticFreshness`。
- 新增字段通过既有父级 Schema 暴露，不增加独立根运行时 Schema 名称。
- stale Proposal 显示“来源定稿已变化”，接受动作禁用，Reject 保留。
- Validation 在正文锚点仍 current、语义已失效时明确显示 semantic stale。

## 性能与安全边界

- freshness 计算避免逐 Issue 无界 N+1；Catalog 在单次请求内缓存项目权威语义摘要、章节 invalidation digest 与 SceneBeat/Version 摘要。
- Semantic fingerprint 使用确定性摘要，不重复持久化完整正文或大图。
- 不增加外部网络、云存储或凭据表面；Ledger/freshness 只读写本地 Project SQLite。
- 不删除历史 Proposal/Validation 伪造 freshness。

## 已实施内容

1. 移除 `DerivedInvalidationService` 与 `snapshotRow()` 对 EndingSnapshot stale 的平行写入，保留 DB Trigger 唯一所有权。
2. 提取事务内 `recordDerivedInvalidation(...)`；StateProposal 采纳及合法 Final 锚点语义写入同事务登记 Ledger。
3. StateProposal Catalog 增加计算型 freshness/actionability；旧 Final Proposal 可 Reject，不可 Accept/Edit-Accept。
4. Rule Validation fingerprint 纳入 Final/Block、SceneBeat graph/mapping/entity relationships、rule/config、semantic invalidation 与权威领域状态摘要。
5. AI Validation 绑定 ConstraintPackage hash、Prompt ID/version 与 semantic identity；Validate Run 在模型调用前持久化起点 identity，运行期间语义变化时结果落库即 stale。
6. Generation requestId replay 忽略系统内部 semantic metadata 后比较原始命令，避免内部审计元数据改变幂等身份。
7. Validation Catalog 对摘要做请求内缓存，避免历史 Batch 数量放大全项目扫描。
8. Renderer 同时显示 Proposal freshness/actionability 与 Validation anchor/semantic freshness。
9. 新增 Final V1→V2、SceneBeat-only、EntityState、AI 运行期竞态、Snapshot Trigger 单一所有权等 Integration 回归。
10. Ready 首轮 Unit 发现 3 个 freshness Zod Schema 无意扩张根运行时导出；已收回模块私有，AR-08 公共面保持 836，未改冻结测试基线。
11. Integration 暴露 Snapshot Trigger 的 `validation` stale reason 与 Contract 不一致，以及固定业务 Clock/SQLite 实时时钟导致 timestamp 竞态误判；均按真实所有权/身份机制修复。
12. Rule 双批次测试移除“随机 UUID 数组位置代表先后”的错误假设，改为验证恰有一个 current 与一个 stale，并新增真正 AI 运行期语义变化用例。
13. Ready Electron E2E 首轮 32/33 暴露 Planning `PlotTree` refresh/unmount command-token 生命周期竞态。修复为 move command 完成后显式 refresh，再写作者状态；未修改通用 Bridge Hook，未放宽 E2E。最终 E2E 全绿。

## 永久验证

最终产品实现 `aa722ef7a87ab746faf04a69520d7a3ef3bd37d1`：

- Quality run `31234554428`：Workspace / Boundary / Format / Lint / Typecheck / Unit / Integration / Migration / Coverage / Build / Electron E2E / Package smoke / 聚合 Quality 全部成功。
- Security run `31234554319`：成功。
- Performance run `31234554324`：成功。
- Task Governance run `31234554318`：成功。
- PR Policy run `31234554320`：成功。

对应 Artifact digest 与完整命令保存在 `docs/test-evidence/M10-16/`。

## 回滚策略

整体回退 M10-16 实现与 Contract/UI 扩展；不回滚 Migration。禁止恢复时间戳竞态守卫、Snapshot Service 双写、公共 Schema 误暴露或 PlotTree 的卸载型 refresh command lifecycle。

## 完成条件

- [x] Snapshot stale 单一所有权恢复为 DB Trigger。
- [x] Derived Invalidation Ledger 与权威语义摘要形成统一 freshness 机制。
- [x] StateProposal stale/actionability 闭环并保留 Reject。
- [x] Rule / AI Validation 建立可计算 semantic freshness。
- [x] Unit / Integration / Coverage / Security / Performance / Build / Electron E2E 全绿。
- [x] Ready Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-16` 成功。
- [ ] `work` 受控同步到已验证 `main`。
