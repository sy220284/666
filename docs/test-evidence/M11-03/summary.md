# M11-03 AI 自动整理与冲突引擎验证摘要

## 冻结实现

- implementationCommit: `1c96d77e856e0bde85b50b7383d9e06aff35e158`
- source PR: `#361`
- baseline main/work: `f9d0bdfb250543d83b91d2c8a1bbab1928942459`
- 本 Evidence 只记录冻结实现后的验证结果；Evidence 收口提交不得改变产品实现。

## 已完成能力

1. `state_proposals` 泛化为八类统一 AI 事实变化建议：`entity_state`、`knowledge_state`、`timeline_event`、`character_relationship`、`foreshadowing`、`arc_milestone`、`entity_create`、`canon_fact`；`ReviewProposal` 继续只做作者审阅读模型。
2. Proposal 接受/编辑接受复用 Canon、Continuity、NarrativePlanning 的事务级 operation；AI 只能生成 pending 建议，作者裁决前不改变权威状态。
3. 新增 CharacterRelationship 权威模型、EntityState semantic kind、ValidationException，并接入具名 Contracts → Main → Preload → Renderer → Core 链路。
4. 确定性连续性冲突与 AI 语义问题统一进入现有 Validation；合理例外支持受控作用域、停用和重新扫描。
5. EndingSnapshot、ConstraintPackage、SemanticRevision、DerivedInvalidation、Clone/Delete/Recovery 与新权威引用完成联动；未知恢复表继续 fail closed。
6. Migration `0031_ai_organization_relationships.sql` 完成旧 StateProposal 兼容迁移、新关系/例外结构和语义修订触发器升级，Migration 矩阵通过。
7. AI 审阅可处理混合建议，新实体建议与有限期状态通过真实 Electron 链路；连续性账本显示人物关系并保持既有编辑功能。
8. 同步冻结决策、IPC 契约与测试策略，移除旧“双类型 StateProposal”权威文档漂移。

## 冻结验证结果

- Quality run `31483129875`: success
  - Release Audit / Static / Reliability / Unit / Integration / Migration / Coverage / Build / Package Gate: success
  - Electron E2E: **33/33 passed (14.0m)**
- Security run `31483129638`: success
- Performance run `31483129628`: success

## 关键 Artifact

- `desktop-e2e-evidence`: `9098450674`
  - SHA256: `129352a9e0f9b34705d6c7c98028c2c7e90eed2eebd0d0e1fb9647f19ba3d6e3`
- `product-tests-and-coverage`: `9098129326`
  - SHA256: `47cca077824fe8603c93f70314f1ac0da88b79d6d54ef4bbd7afd945a3cd1aec`
- `reliability-evidence`: `9098058306`
  - SHA256: `0dfc24931c8e98839f1d6e746643f2ae93284189f6fd3cb9a983e97aced58a39`

## 数据与兼容性结论

- SQLite 继续是故事事实单一真源，没有新增平行 Review/Conflict 持久化真源。
- 旧 `entity_state` / `arc_milestone` Proposal 通过追加 Migration 迁移到结构化 target/value；旧 EntityState semantic kind 默认 `custom`，不从自由文本猜测。
- CharacterRelationship、ValidationException、新 semantic revision trigger 和 ClonePolicy 已进入 Migration/Integration/Recovery 回归。
- Renderer 仍不获得 SQLite、文件系统或 Provider 直连能力；AI 不能绕过 Author Authority。
- 本任务未引入人物关系图、时间轴或伏笔泳道可视化，该范围继续由 M11-04 承接。

## Schema 2 状态

本 Evidence 将 Runtime 收口为 `IMPLEMENTED` 并绑定来源 PR #361。最终 `VERIFIED` 仍需 PR 合并后来源主线提交上的：

- `main-verification=success`
- `task-verification/M11-03=success`
