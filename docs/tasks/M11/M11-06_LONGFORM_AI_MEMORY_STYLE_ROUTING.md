# M11-06 长篇 AI 底座收口

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在 M11-04 的统一基础机制与 M11-05 的 Generation Generic Scope / Workflow Handler 上，完成 StoryDigest、ConstraintPackage 长篇上下文、StyleProfile、AI Task Routing 与 Ctrl+K，形成长篇 AI 创作的最终统一底座。

## 依赖

- M11-05 有效 VERIFIED。
- 必须复用 M11-04 的 Prompt Version Authority、Project Operation Semantics、Renderer Request Ownership、Atomic Navigation。
- 必须复用 M11-05 的 Generic Scope 与 `GenerationWorkflowHandlers`，不得再建第二套 Generation router/runtime。

## 一、StoryDigest

建立三级摘要：

```text
Chapter Digest
↓
Volume Digest
↓
Project Digest
```

每份 Digest 必须绑定：

- scope type / scope id
- source hash
- semantic revision
- generation run
- freshness/status
- content

规则：

1. StoryDigest 是可重建派生数据，不是 Canon/Continuity 权威事实。
2. `VersionService.setFinal` 成功后异步触发摘要重建；摘要失败不得回滚定稿。
3. Chapter 更新后只增量失效受影响的 Volume / Project Digest。
4. stale Digest 不得静默进入 ConstraintPackage。
5. ClonePolicy 使用 `regenerate`；恢复/删除 Version 后 freshness 必须正确。
6. 1000 章作品不得每次生成扫描全文。

## 二、ConstraintPackage 扩展

`ConstraintPackage` 继续是唯一 AI Context Authority，新增来源：

- CharacterRelationship
- StoryDigest
- StyleProfile
- 有效 ValidationException

继续保留：

- Authority Priority
- Token Budget
- Trim Log
- Source Tracking
- Freshness

约束：

1. 禁止新增第二套 ContextBuilder。
2. Digest 只做压缩层；关键权威状态仍按 P0-P4 优先级进入上下文。
3. 所有来源必须可追溯到稳定 ID / revision / hash。
4. 超预算裁剪必须可解释并留 trim log。

## 三、StyleProfile

项目级 typed settings：

```text
baseStyle
learnedMetrics
manualInstructions
sceneOverrides
source
updatedAt
```

可描述句长、段长、对白比例、叙事距离、描写密度、心理描写、动作密度、修辞倾向、词汇倾向、人物声音等。

不得复制 GenreRhythmProfile 已拥有的 hook、goldenThree、excitementDensity、dailyTarget 等网文章奏字段。

### 文风偏离

- 统计型偏离进入现有 Validation rule batch。
- 语义型偏离进入现有 `validate` AI workflow。
- `issueType` 使用稳定 `style.*` 命名。
- 继续复用 Evidence、ignore/mute/false_positive、StoryTodo、ValidationException。
- 不新增平行 StyleIssue 系统。

## 四、AI Task Routing

Core 统一决定：

```text
TaskType
↓
作者指定 Provider preference
↓
ModelSupportProfile
↓
Fallback Policy
↓
最终 Provider / Model
```

Renderer 只配置：

- 自动
- 指定 AI 连接

要求：

1. Routing 只能选择已有受信 Provider/Credential 配置。
2. 指定模型不可用时按显式 Fallback Policy 处理；不得跨凭据边界猜测选择未知 Provider。
3. Prompt 选择必须来自多版本 Registry，并与 ModelSupportProfile 精确匹配。
4. `summarize` 如新增 GenerationRunType，必须同步进入 M11-05 Handler Map 穷尽机制。
5. Provider 仍只由 Core 调用，Renderer 不接触凭据。

## 五、Generation 主入口

保留成熟内部 runType：`skeleton/chapter/rewrite/merge`，作者主入口收敛为：

- 规划这一章 → skeleton
- 生成这一章 → chapter
- 改写选中内容 → rewrite

融合、来源、目标字数、继续生成等高级能力进入二级区域，不删除真实能力。

所有请求继续服从 RendererCommandCoordinator + BridgeRequestCoordinator 两级所有权。

## 六、Ctrl+K

统一复用：

- SearchTools
- `AuthorNavigationTarget`
- `apply-navigation`
- 现有页面命令
- 现有动作命令

形成：

```text
搜索 + 导航 + 命令执行
```

禁止新增第二搜索索引或 `GlobalSearchServiceV2`。搜索正文、历史版本、人物、设定等仍来自现有 SearchTools/FTS。

## DerivedInvalidation

扩现有失效体系：

- StoryDigest 增加 digest 重算 scope。
- 章节/卷/项目摘要按受影响范围增量 stale。
- M11-03 权威语义变化继续触发相关 validation/cache/digest。
- 禁止新增平行 stale ledger。

## 数据库

新增单一派生表 `story_digests`，建议字段：

- id / project_id
- scope_type: chapter | volume | project
- scope_id
- source_version_id nullable
- source_hash
- semantic_revision
- content_json
- status/freshness
- generation_run_id nullable
- created_at / updated_at

StyleProfile 与 TaskRouting 使用 typed `project_settings` key，不新增平行表。

## IPC、错误与生命周期

- Digest 读取/重建通过具名接口或 Generation workflow，不暴露任意 SQL/设置写入。
- Style/TaskRouting 使用 typed settings service。
- 错误继续遵守 `projectOperationError()` / `generationOperationError()` 分层。
- stale digest、无可用模型、摘要失败、文风样本不足必须返回稳定可解释错误。
- 项目/章节/scope 切换后的旧 Renderer 请求不得写回。

## Coverage

Story Knowledge 延伸、Generation 主入口、Style、Routing、Ctrl+K 新代码不得扩大历史 TSX 豁免。按适用场景覆盖 success、empty、failure、retry、cancel、stale、read-only、project/chapter switch、target archived/deleted。

## 性能预算

- 1000 章项目不允许每次生成扫描全文。
- Digest 分层增量重建。
- ConstraintPackage P95 与现有预算对比并提供退化原因。
- Ctrl+K 使用现有索引，不常驻整本书数据。
- Provider/摘要网络请求不得占用 SQLite 写队列。

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

专项必须覆盖：定稿成功/摘要失败、Digest stale/rebuild/clone regenerate、1000 章增量摘要、ConstraintPackage freshness/trim、StyleProfile 与 GenreRhythmProfile 不重叠、style Validation 例外链、Provider routing 指定/回退/拒绝、Prompt 精确版本、Generation 高级能力仍可达、Ctrl+K SearchTools + Atomic Navigation。

## Evidence

保存到：`docs/test-evidence/M11-06/`

## 回滚策略

整体回滚 Digest/Style/Routing/Ctrl+K 应用层增强；StoryDigest 可清空重建，Migration 保持 append-only。不得恢复第二套 Context/Search/Provider/Validation 或绕开 M11-05 Handler Map。

## 完成条件

- StoryDigest 明确为三级、可重建、具备 hash/revision/freshness 的派生数据。
- ConstraintPackage 是唯一 AI Context Authority。
- StyleProfile 与 GenreRhythmProfile 职责无重叠，文风偏离进入现有 Validation。
- Task Routing 在 Core 完成并服从 Provider/Credential/ModelSupport/Prompt version 边界。
- Ctrl+K 复用 SearchTools 与原子 Navigation。
- 1000 章性能、恢复、重启、失败路径、Coverage 与 E2E 全部通过。
