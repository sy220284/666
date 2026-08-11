# M11-06 AI 创作与长篇记忆增强

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在现有 Generation、ConstraintPackage、Validation、SearchTools 与 ProjectSettings 基础上，完成长篇摘要记忆、文风配置与偏离检测、AI 任务路由、生成入口简化和 Ctrl+K 命令面板，使长篇创作在不引入第二套上下文/搜索/Provider 系统的前提下提升可控性和效率。

## 阶段定位

本任务是 M11 产品体验与 AI 创作协同的收口任务，承接 M11-05 通用 Generation scope，并将前序故事知识、AI 审阅、灵感和既有写作能力纳入统一创作工作流。

## 非目标

- 不新增第二套 ContextBuilder、搜索引擎、Provider 系统或 Task Runtime。
- 不新增平行 `StyleIssue` 系统。
- 不将摘要视为权威故事事实。
- 不在定稿事务内调用 Provider 或等待摘要完成。
- 不把 `skeleton`、`chapter`、`rewrite` 等成熟 Generation 生命周期替换为新任务体系。
- 不重复存储 GenreRhythmProfile 已拥有的网文章奏指标。

## 依赖

- M11-05 有效 VERIFIED。

## 真实承接基线

启动时以最新 verified main 为准。重点承接：

- `ConstraintPackageService` / HardenedConstraintPackageService / authority。
- `GenerationRun`、Generation Studio、`generation-start.ts`。
- M11-05 通用 Generation scope。
- `ValidationService` / rule + AI validate。
- `SearchTools` / FTS / NavigationTarget。
- `project_settings`。
- `GenreRhythmProfile`。
- EndingSnapshot、DerivedInvalidation 与 M11-03 CharacterRelationship / ValidationException。

## 关联

- 功能ID：`MEM-001`、`STYLE-001`、`AI-ROUTE-001`、`GEN-UX-001`、`CMD-001`。
- 验收：1000 章长篇上下文可控、摘要失效可重建、文风配置可解释、任务路由可回退、主生成动作简化、全局命令快速定位。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/tasks/TASK_TEMPLATE.md`
- M4-02、M4-04、M6-04 来源任务文档
- M11-03、M11-05 任务卡

## 主要影响范围

- `migrations/project/`
- `packages/contracts/`
- `packages/domain/`
- `packages/core-service/`
- `packages/prompts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/src/features/writing/`
- `apps/desktop/renderer/src/features/checks/`
- `apps/desktop/renderer/src/features/settings/`
- `apps/desktop/renderer/src/shell/`
- `tests/`
- AI、数据库、IPC、UI 与测试文档

## 职责、状态所有权与依赖方向

1. ConstraintPackage 继续是生成上下文唯一权威组装器。
2. StoryDigest 是可重建派生数据，不参与作者事实权威。
3. StyleProfile/TaskRouting 是项目级 typed settings；配置通过现有 `project_settings` 保存。
4. GenreRhythmProfile 继续独占爽点密度、章末钩子、黄金三章、更新目标等节奏指标。
5. 文风偏离统一输出 ValidationIssue。
6. Ctrl+K 只投影现有 SearchTools 和命令能力，不建立第二个搜索索引。
7. Provider 配置与凭据仍由现有 Provider/CredentialBroker 管理；TaskRouting 只选择已存在的受信连接。

## 数据库与 Migration

新增单一派生表：`story_digests`。

建议字段：

- id / project_id
- scope_type: chapter | volume | project
- scope_id
- source_version_id nullable
- source_hash / semantic_revision
- content_json
- status
- generation_run_id nullable
- created_at / updated_at

规则：

- StoryDigest 进入 ProjectClonePolicy `regenerate`。
- 摘要可丢弃重建，不得成为 Canon/Continuity 真源。
- StyleProfile 与 TaskRouting 不新增表，使用 `project_settings` typed key，例如 `ai.styleProfile`、`ai.taskRouting`。
- 如新增 `summarize` GenerationRunType，必须同步 PromptTaskType、ModelSupportProfile、Migration check、ResultRef/Task 生命周期和历史兼容。

## 长篇摘要更新模型

定稿流程固定为：

```text
VersionService.setFinal 提交成功
→ final version 已成立
→ 异步派生摘要任务
→ Chapter Digest
→ 受影响 Volume Digest
→ Project Digest
```

摘要失败不能回滚定稿。读取时显示“长篇记忆待更新”，允许重试。

摘要必须绑定 source hash / semantic revision；源内容变化后旧摘要只可作为 stale 数据，不得静默进入新 ConstraintPackage。

## ConstraintPackage 扩展

禁止新增 ContextBuilder。扩现有约束包来源：

- CharacterRelationship。
- StoryDigest。
- StyleProfile。
- 有效 ValidationException。

Token 裁剪继续记录来源、版本、预算与 trim log。摘要只是压缩层；关键权威状态仍按 P0-P4 优先级进入上下文。

## StyleProfile

项目级配置至少支持：

- baseStyle
- learnedMetrics
- manualInstructions
- sceneOverrides
- source / updatedAt

文风维度可包含：句长、段长、对白比例、叙事距离、描写密度、心理描写、动作密度、修辞倾向、词汇倾向、人物声音。

禁止重复存储：hook、goldenThree、excitementDensity、dailyTarget 等 GenreRhythmProfile 字段。

## 文风偏离检测

- 统计型偏离进入现有 Validation rule batch。
- 语义型偏离进入现有 `validate` AI batch。
- `issueType` 使用稳定命名，例如 `style.*`。
- 继续复用 Evidence、ignore、mute、false_positive、StoryTodo 与 ValidationException。

## AI 任务路由

项目设置记录任务 → Provider preference，例如：

- chapter / rewrite
- state_extract / validate
- idea_explore
- summarize

Core RoutingPolicy 负责：

1. 读取作者明确指定连接。
2. 校验模型支持档案。
3. 无可用指定连接时按明确回退策略选择默认连接或拒绝。
4. 不自动跨凭据边界选择未知 Provider。

Renderer 只展示“自动 / 指定 AI 连接”。

## 生成入口简化

内部生命周期保持：

- `skeleton`
- `chapter`
- `rewrite`
- `merge`

作者主入口收敛为：

- “规划这一章” → `skeleton`
- “生成这一章” → `chapter`
- “改写选中内容” → `rewrite`

高级来源、目标字数、融合、继续生成等能力折叠到二级区域，不删除真实能力。

## Ctrl+K 命令面板

只新增 Renderer 命令面板，复用：

- `SearchTools.search()`。
- `AuthorNavigationTarget`。
- 现有页面/动作命令。

搜索正文、历史版本、人物设定等结果仍来自现有 FTS/SearchTools。禁止 `GlobalSearchServiceV2` 或第二索引。

## DerivedInvalidation

扩现有失效体系，不新建 stale ledger：

- M11-03 新语义变化触发相关 validation/cache。
- StoryDigest 增加 `digest` 或等价重算 scope。
- 章节/卷/项目摘要按受影响范围增量标记 stale。

## IPC、事件与错误码

- 摘要读取/重建可增加具名 digest domain 或现有 generation 辅助接口。
- Style/TaskRouting 通过 typed project settings service，不暴露通用任意设置写入。
- Generation routing 决策必须在 Core 完成。
- stale digest、路由无可用模型、摘要失败、样本文风不足等返回稳定可解释错误。

## 安全、隐私与恢复

- 摘要、StyleProfile 和 routing 都保存在本地项目。
- 凭据仍只在 OS Credential Store。
- Provider 请求只由 Core 发起。
- 克隆项目重新生成摘要；不得复制活动派生任务为 running。
- 删除/恢复 Version 后摘要 freshness 必须正确。

## 性能预算

- 1000 章项目不允许每次生成扫描全文。
- Chapter/Volume/Project digest 分层增量重建。
- ConstraintPackage 组装 P95 与现有预算对比，超过阈值必须提供原因和回归方案。
- Ctrl+K 使用现有索引，不额外常驻整本书数据于 Renderer。
- 摘要任务网络/解析不阻塞 SQLite 写队列。

## 实施内容

1. StoryDigest Schema/Migration/Core。
2. `summarize` Generation task 与通用 scope 接入。
3. 定稿后异步摘要调度与 stale/retry。
4. ConstraintPackage 接入 Relationship/Digest/Style/Exception。
5. typed StyleProfile project setting。
6. Style deviation Validation。
7. typed AI task routing 与 Core RoutingPolicy。
8. Generation Studio 主操作简化。
9. Ctrl+K Command Palette。
10. 1000 章长篇性能与恢复/重启专项。

## 自动化测试

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

专项覆盖：

- 定稿成功、摘要失败。
- 摘要 stale / 重建 / 克隆 regenerate。
- 1000 章增量摘要与 ConstraintPackage 预算。
- StyleProfile 与 GenreRhythmProfile 字段不重叠。
- style Validation 的 ignore/mute/exception。
- Provider routing 明确选择、回退、无可用模型。
- 生成入口简化后原高级能力仍可达。
- Ctrl+K 搜索与导航复用现有 SearchTools。

## 人工验收

- 作者看到三个清晰主生成动作，高级能力仍可展开使用。
- 定稿后摘要失败不会影响正文状态。
- 长篇记忆过期状态清楚可见且能重建。
- 文风设置与网文章奏设置职责清晰。
- Ctrl+K 可快速找到正文、历史版本和设定并准确跳转。

## Evidence

保存到：`docs/test-evidence/M11-06/`

## 回滚策略

整体回滚摘要、Style、Routing 和 UI 增强；StoryDigest 作为派生表可安全清空重建。Migration 保持向前兼容，不回改历史 migration；现有 ConstraintPackage、Generation、Validation、SearchTools 必须恢复为可独立运行状态。

## 完成条件

- 不存在第二套上下文、搜索、Provider 或 Validation 系统。
- StoryDigest 明确为可重建派生数据并完整接入 stale/clone/recovery。
- StyleProfile 与 GenreRhythmProfile 无职责重复。
- 任务路由继续服从现有 Provider/Credential/ModelSupport 边界。
- 主生成流程明显简化且真实能力无缩水。
- 1000 章性能、恢复、重启、失败路径通过专项验收。
- Contracts → Core → Main → Preload → Renderer → 测试闭环完成。
