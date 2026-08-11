# M11-05 灵感胶囊

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

建立独立于正文建议稿和写作待办的灵感对象、AI 灵感探索任务与受控转换链，使作者可以围绕新书、人物、情节、伏笔、反转、感情线、结局等方向生成、收藏、继续展开，并在明确确认后转换为现有权威规划/设定对象。

## 阶段定位

本任务新增真正独立的“创意素材”领域，同时先完成 GenerationRun 从章节专属作用域向通用作用域的兼容重构，为 M11-06 的卷级/全书级长篇记忆任务提供底座。

## 非目标

- 不把 IdeaCard 塞进 Candidate。
- 不把 IdeaCard 伪装成 StoryTodo。
- 不为每种灵感主题新增独立 GenerationRunType。
- 不创建假章节承载全书/人物/新书灵感任务。
- 不让 IdeaConversionService 直接复制 Canon/Planning/Continuity SQL。

## 依赖

- M11-04 有效 VERIFIED。

## 真实承接基线

启动时以最新 verified main 为准。重点承接：

- `generation_runs`、`GenerationIntent`、`PromptTaskType`、ModelSupportProfile。
- Candidate / Candidate apply 生命周期。
- StoryTodo。
- ProjectBrief、PlotNode、SceneBeat。
- Entity / CanonFact。
- Foreshadowing / ArcMilestone。
- M11-03 统一作者裁决与事务 operation 复用原则。

## 关联

- 功能ID：`IDEA-001`、`IDEA-AI-001`、`IDEA-CONVERT-001`、`GEN-SCOPE-001`。
- 验收：生成灵感、收藏/丢弃、继续展开、跨重启保存、转换预览与作者确认。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/tasks/TASK_TEMPLATE.md`
- M4-04、M11-03、M11-04 任务卡

## 主要影响范围

- `migrations/project/`
- `packages/contracts/`
- `packages/domain/`
- `packages/core-service/`
- `packages/prompts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/`
- 数据库、IPC、AI、产品文档

## 职责、状态所有权与依赖方向

1. IdeaCard 是独立领域对象，拥有自己的生命周期。
2. GenerationRun 继续是 AI 任务持久业务生命周期唯一真源。
3. Candidate 继续只承载可进入 Draft 的正文/骨架建议稿。
4. IdeaConversion 只负责“读取 Idea → 形成转换预览 → 作者确认 → 调用目标领域内部 operation → 记录转换结果”。
5. 目标对象写入仍由 Planning/Canon/Continuity/NarrativePlanning 的不变量拥有者负责。

## 数据库与 Migration

### GenerationRun 作用域泛化

当前 `generation_runs.chapter_id` 的章节强绑定必须兼容重构为通用 scope：

- `scope_type`: `project | volume | chapter | scene | entity | selection`。
- `scope_id` 或等价稳定目标表达。
- `chapter_id` 允许 nullable，作为章节任务兼容索引。
- 现有 skeleton/chapter/rewrite/merge/validate/state_extract 历史数据迁移后语义保持不变。

### 新增表

`idea_cards`：

- id / project_id
- idea_kind
- title / summary / content_json
- divergence_level / depth_level
- source_context_json
- generation_run_id nullable
- status: active/favorite/converted/discarded
- created_at / updated_at

`idea_conversions`：

- idea_id
- target_type / target_id
- conversion metadata
- created_at

### Clone/恢复

IdeaCard/Conversion 属于项目业务数据，按正确 ID remap/preserve 策略进入 ProjectClonePolicy。GenerationRun 克隆规则必须继续安全终止活动任务并保持来源关系一致。

## IPC、事件与错误码

新增具名 `idea` 领域：

- list/get/save/archive/favorite/discard
- startExplore
- previewConversion
- applyConversion

AI 启动仍通过 Generation Runtime；不得再建 `idea_runs`。

错误至少覆盖：目标不存在、跨项目、Idea 已转换/丢弃、Generation scope 无效、转换目标冲突、作者权限不足、目标领域拒绝。

## UI 闭环

灵感胶囊至少提供：

- 灵感类型：新书/人物/情节/世界设定/伏笔/反转/感情线/结局/自定义。
- 发散程度：稳妥/差异/脑洞。
- 展开深度：火花/展开/深挖。
- 结果卡片：标题、摘要、展开内容、收藏、继续探索、丢弃、转换。
- 转换前必须展示“将创建/更新什么”，作者确认后才写入权威数据。

## AI 任务设计

新增单一：

`runType = idea_explore`

其余差异通过 Intent 参数表达：`ideaKind`、`divergenceLevel`、`depthLevel`、上下文 scope、作者指令。

禁止建立 `character_idea`、`ending_idea`、`plot_twist_idea` 等 run type 枚举膨胀。

## 安全、隐私与恢复

- 灵感内容保持项目本地数据。
- Provider 仍只由 Core 调用。
- 转换前无任何 Canon/Planning 写入。
- 只读项目可浏览，禁止生成保存与转换。
- 项目恢复/克隆后 Idea 与转换记录引用必须一致。

## 性能预算

- 灵感列表分页/虚拟化。
- Generation 网络请求不占用 SQLite 写队列。
- 大型 Idea content 必须有结构和长度上限。
- 多次继续探索通过 GenerationRun 来源追踪，不在 Renderer 堆叠无限上下文。

## 实施内容

1. GenerationRun generic scope Migration 与合同重构。
2. 现有 Generation 全任务兼容回归。
3. IdeaCard / IdeaConversion Schema、Domain、Core。
4. `idea_explore` Prompt/Output/ModelSupportProfile。
5. Main/Preload/Renderer Bridge。
6. 灵感库与探索 UI。
7. Conversion preview/apply，复用目标领域 transaction operation。
8. Clone/Recovery/Delete/Import 边界与完整测试。

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

- 历史 GenerationRun 迁移兼容。
- 章节任务、项目级任务、实体级任务 scope 校验。
- 活动任务取消/重启/克隆。
- Idea 生命周期与跨项目隔离。
- Conversion 预览无写入；确认后原子写入目标域。
- Candidate 与 StoryTodo 行为完全不受 Idea 影响。

## 人工验收

- 可以在没有章节的情况下探索新书/人物灵感。
- 收藏的灵感重启应用后仍存在。
- “转换为人物/伏笔/情节节点”前可看清影响范围。
- 转换冲突失败时 Idea 保持原状态且目标权威数据无半提交。

## Evidence

保存到：`docs/test-evidence/M11-05/`

## 回滚策略

整体回滚 Idea 功能和 Generation scope 应用代码；Migration 保持 append-only 向前兼容。回滚不得恢复 `chapter_id NOT NULL` 假设导致已升级项目无法打开。

## 完成条件

- IdeaCard 与 Candidate/StoryTodo 职责清晰且无真源重叠。
- GenerationRun 支持通用 scope，现有六类任务行为完全兼容。
- IdeaExplore 使用现有 Generation Runtime。
- Conversion 复用目标领域权威 operation。
- Migration、Clone/Recovery、E2E 与全量回归通过。
