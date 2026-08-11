# M12-01 创作日志与长期项目复盘

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

承接原 V1.5 `DIA-001 AI项目日记` 与 `DIA-002 定时日记`，建立完全本地的 Project Journal。系统基于现有权威业务记录生成可追溯的创作日志与阶段复盘，帮助作者回顾“写了什么、改了什么、为什么改、还有什么没处理”，但日志不得成为第二份故事事实真源。

## 依赖

- M11-06 有效 VERIFIED。
- 复用 GenerationRun Generic Scope / Workflow Handler、AI Task Routing、Prompt Version Authority、StoryDigest、SearchTools、Atomic Navigation。

## 数据来源

Journal 只读取现有业务记录与派生结果，包括：

- Draft / Version 的写作与定稿记录。
- 章节/卷字数变化。
- GenerationRun 与采用结果。
- ReviewProposal / StateProposal 的接受、编辑接受、拒绝与 stale。
- ValidationIssue / ValidationException / StoryTodo / Comment。
- CharacterRelationship、Timeline、Foreshadowing、ArcMilestone 等已确认变化。
- IdeaCard / IdeaConversion。
- Backup / Recovery 等影响作者工作连续性的事件。

禁止通过日志反向推断或写入 Canon、Continuity、Planning、Validation 等权威域。

## Journal 模型

新增具名 `project_journal_entries` 或等价领域模型，至少记录：

- id / project_id
- period_type: manual | daily | weekly
- period_start / period_end
- source_revision / source_hash 或等价来源锚点
- deterministic_summary_json
- ai_summary nullable
- author_note nullable
- generation_run_id nullable
- status
- created_at / updated_at

规则：

1. deterministic summary 由 Core 根据已存在记录计算。
2. AI summary 是可重建解释层，不是事实权威。
3. 作者可以追加自己的 note；作者 note 与 AI summary 明确区分。
4. 每个 period + source anchor 必须幂等，重复调度不得生成重复 Journal。
5. 项目克隆、恢复、移动后引用保持一致；跨项目严格隔离。

## 手动日志

作者可以随时生成：

- 今日创作总结。
- 本周创作总结。
- 指定时间范围总结。
- 当前剧情进展复盘。

生成前先展示确定性摘要，AI 只负责将已存在数据组织成易读复盘，不得补造未发生事件。

## 定时日志

支持项目级设置：

- 关闭。
- 每日。
- 每周。

调度规则：

1. 仅在本地应用运行时执行，不建设云端 scheduler、后台账号服务或远程推送。
2. 应用关闭期间错过周期时，下次打开项目可补生成最多一份对应周期日志。
3. 同一周期使用确定性 identity 防止重复生成。
4. Provider 不可用时保留 deterministic summary，并标记 AI summary 待生成；不得阻塞项目打开或关闭。
5. 定时生成不自动修改任何故事权威数据。

## UI

新增 Journal 时间轴/列表，至少支持：

- 日期/周期浏览。
- 查看“本期新增字数、定稿章节、AI采用、设定变化、检查处理、灵感转换”。
- 查看 AI 复盘与作者 note。
- 从日志条目跳转到对应章节、Version、人物、Validation、Idea 等现有页面。
- 手动重新生成 AI 摘要。
- 定时开关与周期配置。

所有跳转复用 `AuthorNavigationTarget` / Atomic Navigation；不新增第二套搜索或导航系统。

## AI Workflow

如需新增 Journal AI 任务，使用单一 `journal_summarize` 或等价 GenerationRunType，并进入现有 Handler Map、Prompt Registry、ModelSupportProfile 与 RoutingPolicy。

输入必须是结构化 deterministic summary + 有界证据，不允许扫描整个项目数据库自由总结。

## 安全与隐私

- 所有 Journal 数据只存本地项目。
- Provider 仍只由 Core 调用。
- 普通日志不得写入完整正文/完整 Prompt。
- Journal 导出必须由作者显式触发。
- Renderer 无文件系统、数据库和凭据访问能力。

## 性能

- 日志生成按时间窗口查询，不允许全项目无界扫描。
- 500万字项目生成“今日/本周日志”只读取对应时间窗口的必要事件与摘要。
- AI 网络请求不得占用 SQLite 写队列。

## 自动化测试

至少覆盖：

- 手动 daily/weekly/custom period。
- 同周期幂等与重复调度。
- 应用关闭期间 missed schedule 的单次补偿。
- Provider 失败时 deterministic summary 仍可用。
- AI summary 不得制造来源中不存在的权威写入。
- 项目切换与跨项目隔离。
- Journal → 原始目标 Atomic Navigation。
- Clone/Restore 后 Journal 引用正确。
- 500万字 fixture 的窗口查询性能。

验证矩阵沿用当前正式质量体系。

## Evidence

保存到：`docs/test-evidence/M12-01/`

## 回滚策略

整体回滚 Journal UI、调度与领域接口；Journal 属于作者辅助记录，不得影响 Canon/Continuity/Planning/Version 等核心数据。Migration 保持 append-only。

## 完成条件

- `DIA-001/DIA-002` 由本地 Project Journal 完整承接。
- 手动、每日、每周日志均可追溯到真实来源。
- AI 日志失败不影响写作、定稿、项目打开和关闭。
- 无第二份故事事实真源、无云端调度器、无跨项目数据泄漏。
