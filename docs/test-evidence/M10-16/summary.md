# M10-16 最终验证摘要

## 实施绑定

- 任务：`M10-16`
- 来源 PR：`#325`
- 主线基线：`960f0ee94069b40c84e546486dd4d3dd9f630adf`
- 最终产品实现提交：`aa722ef7a87ab746faf04a69520d7a3ef3bd37d1`
- 静态状态：`IMPLEMENTED`
- 有效 VERIFIED 仍以 Controlled Merge 后主线任务 Context 为准。

## 修复结论

1. EndingSnapshot 的 stale 写入收敛到既有数据库 Trigger；`DerivedInvalidationService` 与 `snapshotRow()` 不再平行改写旧快照状态。
2. `derived_invalidations` 保留为 Semantic Invalidation Ledger；具备合法 Final Version 锚点的 StateProposal/语义写入在同一 SQLite 写事务登记失效事实。
3. Timeline、Foreshadowing 等缺少合法 `sourceVersionId` 的直接领域编辑不伪造版本来源；Validation 通过权威领域状态摘要参与 semantic fingerprint。
4. StateProposal 持久化状态仍为 `pending/accepted/edited/rejected`，新增计算型 freshness/actionability；旧 Final 来源可 Reject，Accept/Edit-Accept 被稳定冲突阻断。
5. Rule Validation fingerprint 覆盖 Final/Block、SceneBeat 语义图/Block 映射/实体关系、Rule/Config、Semantic Ledger 与权威领域状态。
6. AI Validation 绑定 ConstraintPackage hash、Prompt ID/version 与 semantic identity。Validate Run 在模型调用前把起点 semantic identity 写入现有 `generation_input_sources.metadata_json`；Catalog 与当前身份比较，不再依赖跨时钟时间戳。
7. requestId replay 在命令身份比较时剥离上述内部 metadata key，保持原命令幂等语义。
8. Validation Catalog 分离 `anchorFreshness` / `semanticFreshness`，并在单次请求内缓存项目、章节和版本摘要，避免历史 Batch 放大全项目扫描。
9. EndingSnapshot Contract 接受既有 Final-change Trigger 写入的 `validation` stale reason；DerivedInvalidation changeType 枚举不扩大。
10. freshness 辅助 Zod Schema 保持模块私有，AR-08 `@worldforge/contracts` 根运行时公共面维持冻结 836 项，未修改冻结测试基线。
11. Rule 双批次回归改为按 semanticFreshness 判断 current/stale，不依赖固定测试时钟下随机 UUID 的数组顺序；另新增“AI 运行期间 EntityState 改变→结果落库即 stale”的真实竞态回归。
12. Ready E2E 首轮 32/33 暴露 Planning `PlotTree` 生命周期竞态：move 已持久化，但 refresh 导致组件卸载并使 command token 失效，成功状态未写回。修复为命令完成后显式 refresh，再由仍挂载父级写“已移动”；未放宽 E2E，也未改通用 Bridge Hook。
13. 已发布 Migration、数据库 Schema、`package.json`、`pnpm-lock.yaml` 与历史 Evidence 均保持冻结。

## 永久验证

最终产品候选 `aa722ef7a87ab746faf04a69520d7a3ef3bd37d1` 已完成以下矩阵：

- Quality：run `31234554428`，成功。
  - Workspace / Boundary / Format / Lint / Typecheck：成功。
  - Unit / Integration / Migration / Coverage：成功。
  - Build / Electron E2E / Package smoke / 聚合 Quality：成功。
  - `product-tests-and-coverage`：`sha256:93c62716bd2a29617afb983044b66b6f5092bd42d390d8f51d57244fdc129327`
  - `desktop-e2e-evidence`：`sha256:21785b6d6e88b7dd6526831d9d447a5307cf1ae56e59160f65308aac6f94963b`
- Security：run `31234554319`，成功。
  - `secret-scan-diagnostics`：`sha256:2e3997ade178b25f9403aadee367156788512bdd3682bde14c93a9c0db0914c0`
- Performance：run `31234554324`，成功。
  - `performance-and-ai-eval-evidence`：`sha256:13c084298c8b8dd6d0ef771678190b9a6cd2941c2905e2f08318aaec842e5b82`
- Task Governance：run `31234554318`，成功。
- PR Policy：run `31234554320`，成功。

## 审计结论

最终 `main..work` 差异已按 Snapshot 单一所有权、StateProposal freshness、Rule/AI semantic identity、Generation 幂等、Contract 冻结面、Renderer 生命周期和治理边界重新复核；差异均落在 M10-16 授权路径，未修改 Migration、生产依赖、锁文件或历史 Evidence，未发现新增 P0/P1。

当前 Evidence 证明最终产品实现与 Ready 永久矩阵通过。任务仍需完成当前治理闭包 Head 的 Evidence/Quality 等最终 Checks、Controlled Merge、来源 PR 对应主线提交的 `main-verification` 与 `task-verification/M10-16`，以及 `work` 受控同步后，才能取得有效 `VERIFIED`。
