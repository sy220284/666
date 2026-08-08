# M10-16 最终 Evidence 摘要

## 实施绑定

- 任务：`M10-16`
- 来源 PR：`#325`
- 主线基线：`960f0ee94069b40c84e546486dd4d3dd9f630adf`
- 最终产品实现提交：`b58938188282783047628849eda637b209b44925`
- Evidence 闭包只允许任务卡、Runtime、TASK_INDEX 与 `docs/test-evidence/M10-16/` 发生后续变化。

## 实施结论

1. EndingSnapshot 的 stale 写入收敛到既有数据库 Trigger；Core 的 DerivedInvalidation 与 Snapshot 刷新路径不再平行改写旧快照状态。
2. `derived_invalidations` 保留为 Semantic Invalidation Ledger；具备合法 Final Version 锚点的 StateProposal/语义写入在同一 SQLite 写事务登记失效事实。
3. Timeline、Foreshadowing 等缺少合法 `sourceVersionId` 的直接领域编辑不伪造版本来源；Validation 通过权威领域状态摘要参与 semantic fingerprint。
4. StateProposal 保留原持久化状态枚举，新增计算型 freshness/actionability：旧 Final 来源仍可 Reject，Accept/Edit-Accept 被稳定冲突阻断。
5. Rule Validation fingerprint 覆盖 Final/Block、SceneBeat 语义图与映射、实体关系、Rule/Config、Semantic Ledger 和权威领域状态。
6. AI Validation 绑定 ConstraintPackage hash、Prompt ID/version 与同一 semantic identity；模型运行期间权威语义变化会使结果落库即表现为 semantic stale。
7. Validation Catalog 分离 `anchorFreshness` 与 `semanticFreshness`，并在单次请求内缓存项目/章节/版本摘要，避免历史 Batch 放大全表扫描。
8. Renderer 对 Proposal 与 Validation 的新鲜度分别展示；历史记录保留，不通过删除记录伪造当前状态。
9. 新增 Integration 回归覆盖 Final V1→V2、SceneBeat-only 变化、EntityState 变化、AI 运行期竞态与 Snapshot Trigger 单一所有权。
10. 已发布 Migration、数据库 Schema、`package.json`、`pnpm-lock.yaml` 与历史 Evidence 均未修改。

## 永久验证口径

当前 Ready PR 必须通过仓库冻结矩阵：

- Task Governance / Evidence / PR Policy；
- Workspace / Boundary / Format / Lint / Typecheck；
- Unit / Integration / Migration / Coverage；
- Security / Performance；
- Build / Electron E2E / Package smoke；
- Controlled Merge 后的 `main-verification` 与 `task-verification/M10-16`。

本 Evidence 只声明实现边界与可复现验证入口；最终有效 VERIFIED 状态仍由仓库有效状态解析器根据来源 PR 的主线验证 Context 计算。

## 审计结论

`main..work` 的产品差异集中在 M10-16 授权路径；Snapshot、Proposal、Validation 三类 freshness 已形成单一职责链，没有新增平行状态机，也没有为缺失来源制造虚假 Final Version 身份。
