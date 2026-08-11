# M11-03 AI 自动整理与冲突引擎

> 状态：In Progress
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在 M11-02 统一 AI 审阅读模型之上，扩展真实状态提取、人物关系、确定性连续性检查、AI 语义校验和可持久化合理例外，使 AI 分析结果统一进入作者审阅链，并复用既有权威领域写路径。

## 阶段定位

本任务负责“AI 自动整理 → 作者审阅 → 权威数据写入 → 派生失效/重新校验”的纵向闭环，为 M11-04 可视化知识工作台提供稳定数据基础。

## 非目标

- 不新增第二套 ReviewProposal、ConflictIssue、ConflictBatch 或独立冲突工作台。
- 不合并现有 `state_extract` 与 `validate` GenerationRun 生命周期。
- 不新增第二套 Timeline、Knowledge、Foreshadowing、Arc、Context 或 Task 真源。
- 不将 Provider 调用塞入定稿事务。
- 不根据旧数据自由文本猜测人物生死、年龄、持有物等语义。

## 依赖

- M11-02。
- 启动实现前，M11-02 必须达到有效 VERIFIED：Runtime `IMPLEMENTED` 且来源主线提交存在 `task-verification/M11-02=success`。

## 真实承接基线

规划冻结基线：`main@b931bd38217b525caf2d0d9ba8d3fd72021dc29e`。

真实承接模块：

- `state_proposals` / `state_proposal_batches` 与 `StateProposalService`。
- M11-02 `ReviewProposal` 统一作者读模型。
- `GenerationRun` 的 `state_extract` 与 `validate`。
- `ContinuityService`、`NarrativePlanningService`、`EntityCanonService`。
- `ValidationService` / `ValidationRuleOperations` / AI Validation batch。
- `EndingSnapshot`、`DerivedInvalidation`、`ConstraintPackageService`。
- `ProjectClonePolicy`、`semantic_revision` 与实体删除引用阻断。

M11-02 历史文本中将后续冲突能力指向其他编号的前向引用，以本任务卡为当前规划权威；冻结历史任务的实现与关闭记录不回写。

## 关联

- 功能ID：`AI-REV-02`、`REL-001`、`VAL-CONT-001`、`VAL-EXC-001`。
- 验收：统一 AI 建议、人物关系、连续性冲突、合理例外、作者裁决、恢复/克隆一致性。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/testing/TEST_STRATEGY.md`
- `docs/tasks/TASK_TEMPLATE.md`
- `docs/tasks/M11/M11-02_UNIFIED_AI_REVIEW_FOUNDATION.md`

## 主要影响范围

- `migrations/project/`
- `packages/contracts/`
- `packages/domain/`
- `packages/core-service/`
- `packages/prompts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/src/features/canon/`
- `apps/desktop/renderer/src/features/checks/`
- `tests/`
- 数据库、IPC、产品与测试文档

## 职责、状态所有权与依赖方向

1. SQLite 继续是故事事实单一真源。
2. `ReviewProposal` 是作者审阅读模型，不成为第二份持久真源。
3. AI 只生成 Proposal/ValidationIssue；作者确认后才改变 Canon、Continuity、NarrativePlanning 等权威数据。
4. 各领域公共 Service 与 Proposal Resolver 共享同一事务级 operation；禁止复制 SQL 和不变量。
5. `state_extract` 负责事实变化建议；`validate` 负责语义问题，二者共享 ConstraintPackage/Evidence/Freshness 工具但保持独立生命周期。
6. 确定性冲突继续归属 Validation 域，已有 Continuity/NarrativePlanning 写入阻断规则必须抽取为可复用策略或预检查能力。

## 数据库与 Migration

允许的结构变化：

1. 泛化 `state_proposals` 的目标表达，兼容现有 `entity_state` 与 `arc_milestone` 历史数据，并扩展：`knowledge_state`、`timeline_event`、`character_relationship`、`foreshadowing`、`entity_create`、`canon_fact`。
2. 新增 `character_relationships`，字段至少覆盖双向实体引用、分类、自由标签、章节有效区间、状态、来源 Version 与 Evidence。
3. 为 `entity_states` 增加明确的语义类型元数据；旧记录默认 `custom`，禁止迁移阶段推断。
4. 新增 Validation 域的持久化合理例外模型，支持 issue/chapter/entity/chapter_range/project_rule 等受控作用域。
5. 扩展必要的 `semantic_revision` trigger、DerivedInvalidation change type/scope 与索引。

禁止新增：

- `review_proposals` 平行表。
- `conflict_issues` / `conflict_batches`。
- 人物图快照表。
- 第二套状态、时间线、伏笔、弧光表。

任何新增表必须同步 `ProjectClonePolicy`。未知表导致恢复 fail-closed 的行为不得放宽。

## IPC、事件与错误码

- 优先扩现有 `stateProposal`、`continuity`、`validation` 领域协议。
- CharacterRelationship 可增加独立具名领域接口，但必须保持 Core 唯一写入与 Author Authority。
- 禁止通用 channel、任意 SQL、任意对象写入接口。
- Proposal stale、目标归档、Evidence 越界、历史回填、规则冲突必须返回稳定错误码。

## UI 闭环

统一入口继续使用“AI 审阅”：

- 显示建议类型、原值、建议值、证据、置信度和新鲜度。
- 支持接受、编辑后接受、拒绝。
- stale 建议只能拒绝或重新分析。
- Validation 支持“忽略本次”和“记住这个例外”两种明确动作。
- 人物关系接受后进入权威关系数据，不在 Renderer 维护副本。

## 安全、隐私与恢复

- AI 输出必须经过结构化 Schema 和 Evidence 白名单验证。
- Renderer 不获得数据库、文件系统或 Provider 直连能力。
- 项目克隆、恢复、实体删除、导入/迁移必须覆盖新引用。
- Proposal、Validation 与作者权威状态跨项目严格隔离。

## 性能预算

- 章节定稿事务不等待 Provider。
- `state_extract` 与 `validate` 可独立失败/重试，不阻断正文定稿。
- 关系与连续性查询按项目/章节/实体建立必要索引。
- 不为图谱或检查结果预生成全书快照。

## 实施内容

1. Proposal 持久化泛化与兼容迁移。
2. Canon/Continuity/NarrativePlanning 事务 operation 共用化。
3. CharacterRelationship 全链路。
4. EntityState 语义类型元数据。
5. 扩展 `state_extract` 输出与 ReviewProposal 适配。
6. 将已有时间线/依赖/章节区间等硬规则接入 Validation 预检查/报告。
7. 扩展 `validate` 语义连续性问题。
8. ValidationException 持久化和匹配。
9. Snapshot、Invalidation、ConstraintPackage、Clone/Delete 联动。
10. Renderer AI 审阅与检查闭环。

## 自动化测试

至少覆盖：

- Migration 前后 Proposal 数据兼容。
- 每种 Proposal 接受/编辑接受/拒绝/stale。
- 人物关系章节有效区间、跨项目、归档实体、删除阻断。
- 时间线依赖循环、确定顺序、同时多地规则只存在一份权威实现。
- 合理例外作用域与重新扫描。
- SemanticRevision、DerivedInvalidation、EndingSnapshot freshness。
- Project clone/restore/remap 与未知表 fail-closed。
- Provider 失败不回滚定稿。
- IPC/Preload/Core/Renderer 真实 E2E。

验证矩阵：

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm check:docs
pnpm check:governance
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:reliability
pnpm test:perf
pnpm build
pnpm test:e2e
```

## 人工验收

- 定稿后 AI 分析失败时正文仍保持已定稿。
- AI 审阅中可一次处理多种建议，不出现第二套建议页面。
- 人物关系、状态、时间线等接受后立即在原有设定/连续性区域可见。
- “记住这个例外”后同一有效作用域不重复制造相同问题。

## Evidence

保存到：`docs/test-evidence/M11-03/`

## 回滚策略

按来源 PR 整体回滚 Proposal 泛化、关系模型、语义元数据、例外模型及纵向接口；回滚必须保持 Migration 向前兼容，已升级项目不能依赖历史 Migration 被修改。不得只删除测试或 ClonePolicy 项目以绕过恢复失败。

## 完成条件

- 所有 AI 建议统一进入现有 AI 审阅链。
- 新权威类型不存在平行真源或重复 SQL 规则。
- 新表完整接入 ClonePolicy、SemanticRevision、删除引用、恢复和迁移测试。
- 确定性冲突与 AI 语义校验均进入现有 Validation。
- Contracts → Core → Main → Preload → Renderer → 测试纵向闭环。
- Ready Evidence、Runtime、TASK_INDEX 与当前 PR 绑定符合现行治理规则。
