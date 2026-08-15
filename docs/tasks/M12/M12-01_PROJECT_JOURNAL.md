# M12-01 创作日志与长期项目复盘

> 状态：Implemented  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

建立完全本地、可追溯的 Project Journal，帮助作者回顾“写了什么、改了什么、为什么改、还有什么没处理”。Journal 只聚合现有权威业务记录与派生结果，不成为第二份故事事实真源，也不建立第二套创作统计系统。

本任务承接原 V1.5 `DIA-001 AI项目日记` 与 `DIA-002 定时日记`，但按当前已完成代码收敛为“跨域事件聚合 + 可重现确定性快照 + AI可读复盘 + 作者备注”。

## 依赖与执行顺序

- 依赖：M11-07 有效 VERIFIED。
- M12 阶段建议在 M12-02 完成后执行，但不把 Research 设为硬依赖；两者领域独立。
- 复用 GenerationRun Generic Scope / Workflow Handler、AI Task Routing、Prompt Version Authority、StoryDigest、SearchTools、Atomic Navigation。

## 已有能力基线

必须直接复用当前主线已经存在的能力：

- `writing_sessions`：已有按项目/章节/日期记录的写作 session、净字符变化、活动时间与时区语义。
- `story_digests`：已有 chapter / volume / project 三级长篇摘要、来源 Hash、来源 Version 与 freshness。
- StoryKnowledge History：已有 Version、Candidate、Backup、Backup Failure 等可追溯历史读取。
- GenerationRun / Candidate：已有生成来源、采用结果、Prompt/模型与运行记录。
- Validation / StoryTodo / StoryComment、ReviewProposal / StateProposal、IdeaCard / IdeaConversion、Continuity / Planning 等已有权威记录。

Journal 不得复制上述领域成为新的业务权威表，也不得为了复盘新增全局 Event Sourcing、通用 `project_events` 总线或要求所有业务双写日志事件。

## 数据来源

Journal 只读取现有记录，包括：

- `writing_sessions` 与章节/卷字数变化。
- Draft / Version 的写作与定稿记录。
- GenerationRun、Candidate 与采用/撤销结果。
- ReviewProposal / StateProposal 的接受、编辑接受、拒绝与 stale。
- ValidationIssue / ValidationException / StoryTodo / StoryComment。
- CharacterRelationship、Timeline、Foreshadowing、ArcMilestone 等已确认变化。
- IdeaCard / IdeaConversion。
- Backup / Recovery 等影响作者工作连续性的事件。
- 现有 StoryDigest 作为剧情进展复盘的有界派生输入。

禁止通过 Journal 反向推断或写入 Canon、Continuity、Planning、Validation、Draft、Version 等权威域。

## Journal 模型

允许新增具名 `project_journal_entries` 或等价领域模型，只保存复盘本身及其来源锚点，至少记录：

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

1. `deterministic_summary_json` 由 Core 按时间窗口从既有记录聚合计算，不复制完整正文。
2. AI summary 是可重建解释层，不是事实权威。
3. 作者 note 与 AI summary 明确区分，作者 note 不自动提升为 Canon。
4. 每个 period + source anchor 必须幂等，重复调度不得生成重复 Journal。
5. 来源锚点必须足以判断条目是否过期/需要重建，但不得要求所有业务域新增日志双写。
6. 项目 Clone / Restore / Move 后引用保持一致；跨项目严格隔离。

## 确定性聚合

优先从现有数据计算，不新建重复统计基础设施。至少形成：

- 新增/净变化字符数与写作时段。
- 新建、修改、定稿的章节/Version。
- AI 生成次数、完成状态与作者实际采用结果。
- 已确认的设定、关系、时间线、伏笔、弧光变化。
- 已处理/新增的 Validation、Todo、Comment。
- 灵感创建与转化。
- Backup / Recovery 重要事件。
- 当前 chapter / volume / project StoryDigest 的可用状态与剧情进展摘要引用。

禁止为了得到以上数据复制 `writing_sessions`、Version History、StoryDigest 或 GenerationRun。

## 手动复盘

作者可以生成：

- 今日创作总结。
- 本周创作总结。
- 指定时间范围总结。
- 当前剧情进展复盘。

生成前先展示确定性摘要；AI 只负责将已存在数据组织成易读复盘，不得补造未发生事件。

## 定时复盘

支持项目级设置：关闭 / 每日 / 每周。

调度规则：

1. 仅在本地应用运行时执行，不建设云端 scheduler、后台账号服务或远程推送。
2. 应用关闭期间错过周期时，下次打开项目最多补生成一份对应周期日志。
3. 同一周期使用确定性 identity 防止重复生成。
4. Provider 不可用时保留 deterministic summary，并标记 AI summary 待生成；不得阻塞项目打开、保存或关闭。
5. 定时生成不得修改任何故事权威数据。

## UI

新增 Journal 时间轴/列表，至少支持：

- 日期/周期浏览。
- 查看新增字数、写作时段、定稿章节、AI采用、设定变化、检查处理、灵感转换、恢复事件。
- 查看 AI 复盘与作者 note。
- 从日志条目跳转到章节、Version、人物、Validation、Idea 等现有页面。
- 手动重新生成 AI 摘要。
- 定时开关与周期配置。

所有跳转复用 `AuthorNavigationTarget` / Atomic Navigation；不新增第二套搜索或导航系统。

## AI Workflow

如需新增 Journal AI 任务，使用单一 `journal_summarize` 或等价 GenerationRunType，并进入现有 Handler Map、Prompt Registry、ModelSupportProfile 与 RoutingPolicy。

输入必须是结构化 deterministic summary + 有界证据/已有 StoryDigest，不允许扫描整个项目数据库自由总结，也不允许直接读取全量正文。

## 非目标

- 不建立通用 Event Sourcing / Activity Event Bus。
- 不要求现有所有业务写路径新增 Journal 双写。
- 不重做 writing session、字数统计或节奏统计。
- 不重做 StoryDigest。
- 不建立第二套历史版本、搜索、导航或 AI 运行时。
- 不把 Journal 作为恢复、Canon、Continuity 或 Planning 的权威来源。

## 安全与隐私

- 所有 Journal 数据只存本地项目。
- Provider 仍只由 Core 调用。
- 普通日志不得写入完整正文、完整 Prompt 或凭据。
- Journal 导出必须由作者显式触发。
- Renderer 无文件系统、数据库和凭据访问能力。

## 性能

- 日志生成按时间窗口查询，不允许全项目无界扫描。
- 500万字项目生成“今日/本周日志”主要读取对应时间窗口记录与已有摘要，不回扫全部正文。
- AI 网络请求不得占用 SQLite 写队列。
- Journal 列表分页/虚拟化，不一次载入全部长期历史。

## 自动化测试

至少覆盖：

- daily / weekly / custom period 手动复盘。
- 直接复用 writing_sessions / Version / GenerationRun / StoryDigest 的聚合正确性。
- 同周期幂等与重复调度。
- 应用关闭期间 missed schedule 的单次补偿。
- Provider 失败时 deterministic summary 仍可用。
- AI summary 不得制造来源中不存在的权威写入。
- 项目切换与跨项目隔离。
- Journal → 原始目标 Atomic Navigation。
- Clone / Restore 后 Journal 引用正确。
- 500万字 fixture 的窗口查询性能。
- 门禁保证未引入第二套通用事件日志/统计权威。

验证矩阵沿用当前正式质量体系，按 Unified Risk Matrix 触发必要重型验证。

## Evidence

保存到：`docs/test-evidence/M12-01/`

必须说明每类 deterministic summary 字段实际读取的权威来源，证明 Journal 是派生层而非第二真源。

## 收口验证记录

- 最终实现冻结点：`c183bf436ee4cad5a3682cd3bb7a7e96c4a324da`。
- Schema 2 Evidence 已精确绑定该冻结点，清单覆盖 `README.md`、`summary.md`、`commands.txt`、`known-risks.md`。
- 冻结点完整权威门已通过：Quality #5794（run `31894307123`）、Security #5586（run `31894307056`）、Performance #5550（run `31894307017`）。
- Quality #5794 已实际通过静态检查、全量产品测试与覆盖率、可靠性、Electron 全量桌面端到端、Linux 作者体验、Windows 真实拼音验收和 macOS 作者体验；视觉基线由两个独立 Quality 运行的同尺寸、同 SHA-256 截图见证后更新，并在本轮正式 E2E 中通过。
- 最终实现冻结点之后只允许任务卡、Runtime、`TASK_INDEX.md` 与本任务 Evidence 等收口路径变化，不再混入产品代码。
- 当前状态为 Implemented；合并后的 `main-verification` 与 `task-verification/M12-01` 成功后才取得有效 VERIFIED。

## 回滚策略

整体回滚 Journal UI、调度与领域接口；Journal 属于作者辅助记录，不得影响 Canon / Continuity / Planning / Version 等核心数据。Migration 保持 append-only。

## 完成条件

- `DIA-001/DIA-002` 由本地 Project Journal 完整承接。
- 手动、每日、每周复盘均可追溯到真实来源。
- 已有 writing_sessions、StoryDigest、History、GenerationRun 等能力被直接复用，无重复统计/摘要系统。
- AI 日志失败不影响写作、定稿、项目打开和关闭。
- 无第二份故事事实真源、无通用事件双写系统、无云端调度器、无跨项目数据泄漏。
