# M11-06 长篇 AI 底座收口

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在 M11-04 的统一基础机制与 M11-05 的 Generation Generic Scope / Workflow Handler 上，完成 StoryDigest、ConstraintPackage 长篇上下文、StyleProfile、AI Task Routing 与 Ctrl+K，并正式吸收原 V1.5 的长篇记忆、卷级连续性和 300万—500万字适配目标，形成长篇 AI 创作的最终统一底座。

## 依赖

- M11-05 有效 VERIFIED。
- 必须复用 M11-04 的 Prompt Version Authority、Project Operation Semantics、Renderer Request Ownership、Atomic Navigation。
- 必须复用 M11-05 的 Generic Scope 与 `GenerationWorkflowHandlers`，不得再建第二套 Generation router/runtime。

## 原 V1.5 能力归并

本任务正式承接旧规划中的：

- `MEM-001` L0—L5 自动记忆目标。
- `MEM-002` 热/温/冷记忆管理目标。
- `MEM-003` 卷级连续性检查点目标。
- 剧情弧/卷级摘要自动维护。
- 300万—500万字完整适配。
- `SEM-001` 语义检索的真实证据触发评估。

实现语义统一调整为现有架构：

1. 不恢复独立 L0—L5 数据表、记忆调度器或第二套 ContextBuilder。
2. 不物理迁移权威故事数据形成“热表/温表/冷表”。热/温/冷只表示一次上下文请求中的召回优先级与压缩层级。
3. 当前章节、邻近章节和当前有效 Canon/State/Relationship/Timeline/Validation 等权威事实属于高优先级直接召回层。
4. Chapter/Volume Digest 属于中层压缩记忆；Project Digest 与更远历史按需召回。
5. 所有层级仍由 ConstraintPackage 统一裁剪、追踪来源和验证 freshness，不产生第二份故事事实。
6. 卷级连续性由 Volume Digest + 卷边界处的权威状态/关系/时间线/伏笔/人物弧光共同完成，不新增平行 checkpoint 真源。

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
6. 大型作品不得每次生成扫描全文。
7. 卷边界生成/刷新 Volume Digest 时必须保存足够的跨卷连续性摘要，但关键事实仍回查权威 Canon/Continuity 数据。

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
5. 记忆冷热分层只能影响召回顺序、压缩粒度与预算，不得改变权威数据的物理归属。
6. 跨卷生成必须显式验证人物状态、关系、时间线、知情、伏笔与人物弧光的连续性入口。

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

## 七、300万—500万字规模验收

除现有 100/300/1000 章测试外，增加真实大长篇 corpus：

- 300万字作品。
- 500万字作品。

至少覆盖：

- 应用启动与项目打开。
- 章节切换与连续写作。
- Autosave / Version / Draft Revision。
- 全项目搜索与 Ctrl+K。
- StoryKnowledge Projection 的人物、关系和时间线窗口查询。
- ConstraintPackage 组装与跨卷召回。
- Chapter / Volume / Project Digest 增量失效和重建。
- Backup / Restore。
- 项目切换后的旧请求隔离。
- Renderer/Core 常驻内存与峰值内存。
- SQLite 文件增长、索引增长与查询 P50/P95/P99。

验收原则：

1. 不允许因作品规模增加而出现每次生成/导航全书扫描。
2. 500万字作品必须保持可继续编辑、搜索、定稿、生成、备份和恢复。
3. 关键路径相对当前性能基线出现明显退化时必须定位到具体查询/序列化/索引/上下文阶段后再优化，禁止无证据预优化。

## 八、语义检索证据门

`SEM-001` 在本任务中只做真实评测，不默认实现向量层。

建立包含别名、同义改写、跨章事件、人物关系、伏笔、历史版本和自然语言描述的检索 Eval，先验证：

```text
FTS5/SearchTools
+ StoryKnowledgeProjection
+ StoryDigest
```

能否满足作者定位与 ConstraintPackage 召回。

触发后续本地语义检索任务的条件：

1. 已知目标的关键查询在 Top-20 中持续漏召回；或
2. 跨章语义改写查询的目标召回率低于验收基线；或
3. ConstraintPackage 因现有检索能力漏掉明确存在且应进入上下文的关键证据。

只有出现可复现 Evidence 才允许后续任务新增本地 Embedding / Semantic Retrieval；未触发时保持现有 FTS/SearchTools 单索引体系。

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

- 1000 章及 300万/500万字项目不允许每次生成扫描全文。
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

专项必须覆盖：

- 定稿成功/摘要失败。
- Digest stale/rebuild/clone regenerate。
- 1000 章及 300万/500万字增量摘要。
- 跨卷人物状态、关系、时间线、知情、伏笔、人物弧光连续性。
- ConstraintPackage freshness/trim/冷热召回优先级。
- StyleProfile 与 GenreRhythmProfile 不重叠。
- style Validation 例外链。
- Provider routing 指定/回退/拒绝。
- Prompt 精确版本。
- Generation 高级能力仍可达。
- Ctrl+K SearchTools + Atomic Navigation。
- 语义检索触发 Eval 与 Evidence 输出。

## Evidence

保存到：`docs/test-evidence/M11-06/`

除常规 Evidence 外必须保存：

- `longform-3m-*` / `longform-5m-*` 性能与内存结果。
- 跨卷连续性 fixture 结果。
- `semantic-retrieval-gate` Eval 结果及是否触发 `SEM-001` 的明确结论。

## 回滚策略

整体回滚 Digest/Style/Routing/Ctrl+K 应用层增强；StoryDigest 可清空重建，Migration 保持 append-only。不得恢复第二套 Context/Search/Provider/Validation、旧式 L0—L5 调度器、冷热物理迁移体系或绕开 M11-05 Handler Map。

## 完成条件

- StoryDigest 明确为三级、可重建、具备 hash/revision/freshness 的派生数据。
- 原 `MEM-001/MEM-002/MEM-003` 的长篇记忆目标已由权威事实 + StoryDigest + ConstraintPackage + Freshness 完整承接，无第二套记忆真源。
- ConstraintPackage 是唯一 AI Context Authority。
- 跨卷生成具备可验证的连续性召回路径。
- StyleProfile 与 GenreRhythmProfile 职责无重叠，文风偏离进入现有 Validation。
- Task Routing 在 Core 完成并服从 Provider/Credential/ModelSupport/Prompt version 边界。
- Ctrl+K 复用 SearchTools 与原子 Navigation。
- 1000 章、300万字、500万字性能、恢复、重启、失败路径、Coverage 与 E2E 全部通过。
- `SEM-001` 是否需要实施由真实 Eval Evidence 明确决定。
