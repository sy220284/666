# M11-05 Generation Generic Scope、Workflow Handler 与灵感胶囊

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

一次完成 GenerationRun 通用作用域、Generation Workflow Handler Map 与 Idea Capsule，避免先迁移 scope、后续再拆 workflow 造成第二轮 Generation 数据与生命周期迁移。

## 依赖

- M11-04 有效 VERIFIED。
- 必须复用 M11-04 已收口的 Prompt Version Authority、Project Operation Semantics、Renderer Request Ownership 与 Atomic Navigation。

## 一、GenerationRun Generic Scope

GenerationRun 从章节专属改为通用作用域：

```text
scopeType:
  project
  volume
  chapter
  scene
  entity
  selection

scopeId
chapterId nullable
```

要求：

1. `generation_runs.chapter_id` 从强绑定章节改为兼容索引；非章节任务不得创建假章节。
2. 历史 `skeleton/chapter/rewrite/merge/validate/state_extract` 全量迁移后语义保持不变。
3. scope 必须验证 project ownership、目标存在性和目标类型；跨项目/失效目标 fail-closed。
4. Clone/Restore/Delete 继续保持 GenerationRun 来源关系和终态语义；活动任务不得被克隆为 running。
5. Migration append-only，禁止修改历史 Migration。

## 二、Generation Workflow Handler Map

建立单一 `GenerationWorkflowHandlers`，对 `GenerationRunType` 穷尽映射：

```text
skeleton
chapter
rewrite
merge
validate
state_extract
idea_explore
```

每个 Handler 独立负责：

- source resolution
- constraint input
- prompt identity/version
- output mode
- output parse
- domain persist/result refs

统一 Generation Runtime 继续只负责：

- GenerationRun lifecycle
- Task lifecycle
- Provider streaming
- cancel
- partial
- usage
- terminal state

强制要求：

1. 新增 `GenerationRunType` 而缺少 Handler 时 TypeScript 编译失败。
2. Router 不再通过持续增长的 `if (runType === ...)` 拥有各工作流细节。
3. Handler 必须使用 M11-04 Prompt Registry 精确版本；历史 GenerationRun 的 promptId/promptVersion 仍可解析。
4. Provider 请求、任务取消和 partial 生命周期仍由统一 Runtime 拥有，Handler 不复制状态机。
5. `validate/state_extract` 的持久化必须继续进入 Validation/StateProposal 权威领域，不建立 Generation 私有真源。

## 三、Idea Capsule

新增独立领域对象：

### IdeaCard

至少包含：

- id / projectId
- ideaKind
- title / summary / content
- divergenceLevel
- depthLevel
- sourceContext
- generationRunId nullable
- status: active / favorite / converted / discarded
- createdAt / updatedAt

### IdeaConversion

记录 Idea 到目标领域对象的转换事实，不复制目标领域权威字段。

Conversion 固定链路：

```text
Idea
↓
Preview
↓
作者确认
↓
目标领域 Operation
↓
权威对象
```

要求：

1. Preview 阶段零权威写入。
2. Apply 复用 Planning/Canon/Continuity/NarrativePlanning 已有事务 operation。
3. 目标领域失败时 Idea 与目标权威数据不得半提交。
4. IdeaCard 独立于 Candidate 与 StoryTodo；三者不得互相伪装或共享写入真源。

## AI 任务

新增单一：

```text
runType = idea_explore
```

差异通过 `ideaKind`、`divergenceLevel`、`depthLevel`、generic scope、作者指令表达；禁止增加 `character_idea`、`ending_idea`、`plot_twist_idea` 等 run type。

Prompt 必须通过多版本 Registry 注册，并进入 ModelSupportProfile 精确 `(taskType, promptId, promptVersion)` 匹配。

## Renderer 生命周期与导航

- Idea list/get 等相同只读请求使用 `mode: 'share'`。
- 同一 Idea/Scope 的 latest-only 请求显式提供 `laneKey`，Coordinator 不解析业务 payload。
- 项目切换、scope 切换、继续探索后旧结果不得回写。
- Conversion 成功后跳转目标对象统一使用 `AuthorNavigationTarget + apply-navigation`。

## 数据库与恢复

新增 `idea_cards`、`idea_conversions`；Generation scope 使用追加 Migration 完成兼容重构。

- Idea 属于项目业务数据，ClonePolicy 必须定义正确 remap/preserve。
- GenerationRun 克隆继续终止活动任务并保持来源关系一致。
- 删除/恢复目标对象后 Conversion 读取必须返回明确 missing/stale，不猜测替代目标。

## 错误模型

继续遵守：Service internal error → `projectOperationError()` / `generationOperationError()` → Main error semantics → Renderer 作者可理解展示。

至少覆盖：scope invalid、target missing、cross-project、Idea converted/discarded、conversion conflict、read-only、Provider unsupported、Prompt version unavailable。

## UI

灵感胶囊支持：

- 新书 / 人物 / 情节 / 世界设定 / 伏笔 / 反转 / 感情线 / 结局 / 自定义
- 发散程度：稳妥 / 差异 / 脑洞
- 展开深度：火花 / 展开 / 深挖
- 收藏 / 继续探索 / 丢弃 / 转换
- 转换前明确展示将创建或更新的目标对象

## Coverage

Idea Capsule、Generation 主入口与 Conversion 新代码不得扩大历史 TSX 豁免。按适用场景覆盖 success、empty、failure、retry、cancel、stale、read-only、project switch、scope/chapter switch、target deleted/archived。

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

专项必须覆盖：历史 GenerationRun 迁移、六类旧任务行为、所有 generic scope、Handler Map 穷尽性、Prompt 精确版本、活动任务 cancel/restart/clone、Idea 生命周期、Conversion preview 零写入、确认原子写入、Candidate/StoryTodo 无回归。

## Evidence

保存到：`docs/test-evidence/M11-05/`

## 回滚策略

整体回滚 Idea 与 Workflow Handler 应用代码；Migration 保持向前兼容。不得恢复 `chapter_id NOT NULL` 假设，也不得把 Handler 再散回多套 Router 生命周期。

## 完成条件

- GenerationRun generic scope 成为唯一 Generation 作用域模型。
- `GenerationWorkflowHandlers` 对所有 runType 编译期穷尽。
- Runtime 与 Handler 职责清晰，无重复 lifecycle。
- IdeaCard 与 Candidate/StoryTodo 无职责重叠。
- Conversion 复用目标领域权威 operation。
- Migration、Clone/Restore/Delete、Coverage、Performance 与 E2E 全链路通过。
