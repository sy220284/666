# WorldForge V1.0 数据字典

> 状态：Frozen  
> 字段结构以`DATABASE_SCHEMA.md`为准。

## 1. 通用字段

| 字段 | 统一语义 |
|---|---|
| `id` | 小写带连字符UUID，由Core生成 |
| `project_id` | 数据所属项目；所有项目级写入必须校验 |
| `created_at` / `updated_at` | UTC ISO-8601毫秒字符串 |
| `deleted_at` | 软删除时间；非空表示进入回收站 |
| `order_key` | 64位整数间隔排序键，初始间隔1024 |
| `content_hash` | 标准化UTF-8语义内容的SHA-256 |
| `status` | 领域状态，枚举见对应实体 |
| `source_id` / `source_type` | 来源记录与类别 |

## 2. 项目与规划

| 名称 | 定义 |
|---|---|
| Project | 单部作品的本地工程，拥有独立`project.sqlite` |
| ProjectBrief | 高概念、阅读承诺、主角目标、冲突、终局和必须/禁止项 |
| Volume | 卷级容器 |
| Chapter | 章节实体，指向唯一活动Draft和当前定稿Version |
| PlotNode | 大纲层级节点，可表示卷、剧情弧或章节规划 |
| SceneBeat | 章节内场景节拍，包含目标、冲突、结果、类型、字数比例、必选标记和排序；可选关联PlotNode、人物/地点UUID与DraftBlock |

Chapter状态：

```text
pending → outlined → writing → reviewing → finalized
```

finalized章节可以恢复出新活动Draft继续返修，历史Version不变。

## 3. 正文、候选与版本

| 名称 | 定义 |
|---|---|
| Draft | 可编辑工作稿；每章可有历史Draft，但只能有一个`active` Draft |
| DraftBlock | Draft中的结构化文本块 |
| logicalBlockId | 跨Draft、Candidate和Version追踪同一逻辑段落的稳定标识 |
| Revision | Draft每次原子Patch提交后的递增序号 |
| Block Patch | 有序的insert/update/delete/move操作数组 |
| expectedHash | Patch生成时目标块的内容Hash |
| Candidate | AI生成或融合后的备选结果，未经确认不进入Draft |
| Version | 不可变历史快照 |
| ApplyRecord | Candidate采用动作、选择、Revision和回退信息 |
| Checkpoint | 高风险操作前创建的可恢复状态 |

Block类型：`paragraph | dialogue | heading | separator`  
Block来源：`manual | ai | mixed | imported`

Candidate类型：`skeleton | full | rewrite | merge`  
Candidate状态：`pending | accepted | discarded`  
Candidate完整度：`complete | partial`

## 4. 设定与连续性

| 名称 | 定义 |
|---|---|
| Entity | 人物、地点、势力、道具、能力、规则、事件或自定义对象 |
| CanonFact | 作者确认的稳定事实，AI不能直接修改 |
| EntityState | Entity在章节区间内生效的动态状态记录；当前值与历史值分离 |
| EvidenceAnchor | 指向Chapter、SceneBeat、Version、Entity或logicalBlock的项目内证据锚点 |
| TimelineEvent | 有起止、精度、人物角色、地点、章节、归档状态和前置依赖的事件 |
| TimelineEntityRole | TimelineEvent中的`participant`、`witness`或`subject`关系 |
| KnowledgeState | 人物在章节区间内对信息的知道、相信、怀疑、误解或未知状态 |
| Foreshadowing | 有埋设、强化、揭示和取消生命周期的伏笔 |
| CharacterArc | 人物长期成长、黑化、觉醒、堕落、救赎或自定义弧光 |
| ArcMilestone | 弧光中的可确认里程碑节点 |
| EndingSnapshot | 定稿后供下一章读取的最小连续性入口 |
| StateProposal | AI或规则提出的`entity_state`或`arc_milestone`变化候选 |
| DerivedInvalidation | 旧章语义变化对后续快照、校验和缓存造成的失效记录 |
| stale | 派生数据因上游修改而过期，不能继续当作有效输入 |

Entity类型：

```text
character | location | faction | item | ability | rule | event | custom
```

Entity状态：

```text
active | archived
```

CanonFact状态：

```text
current | historical
```

同一Entity与factKey只有一条current；作者确认新值时旧值进入historical。AI、规则校验和模型推测只能形成后续提案，不能直接改变Canon。SceneBeatEntity是项目内显式引用，跨项目关联无效。

EntityState记录状态：

```text
current | historical | superseded | invalid
```

同一Entity与规范化stateKey只有一条`current`。作者设置新值时，旧current在同一事务转为`historical`；同起点修订转为`superseded`。章节区间统一使用`[validFromChapterId, validUntilChapterId)`半开语义：旧记录没有终点或与新记录重叠时，终点截断到新值起点；旧记录已有更早或相同终点时保留原终点，允许存在明确空档期。终点为空表示持续有效。`sourceVersionId`必须属于同项目，EvidenceAnchor也必须通过项目归属校验。AI权限不能写入、失效或归档权威连续性记录。

TimelineEvent精度：

```text
exact | day | month | year | approximate | unknown
```

TimelineEvent状态：

```text
active | archived
```

时间冲突只对可比较范围执行。`approximate`和`unknown`不伪造硬时间顺序；可比较范围会阻断同一在场人物在重叠时间占据不同地点、事件依赖循环以及前置事件确定晚于后继事件。`participant`和`witness`视为人物在场，`subject`只表示事件对象，不自动推定其身处事件地点。归档保留事件及引用账本，不作为默认活动查询结果。

TimelineEntityRole：

```text
participant | witness | subject
```

KnowledgeState状态：

```text
knows | believes | suspects | misunderstands | unknown
```

KnowledgeState记录状态：

```text
current | historical | invalid
```

同一Character与规范化informationKey只有一条`current`，章节区间使用与EntityState相同的半开、截断和空档保留语义。新认知状态会结束旧current并保留历史。每条记录至少具有同项目`sourceVersionId`或`sourceLogicalBlockId`之一；创建记录时逻辑块必须真实存在且属于当前项目，记录被作者确认后，即使对应正文块随后删除，稳定logicalBlock来源仍保留为历史锚点，不会被误解释为新的权威事实。

StateProposal类型：

```text
entity_state | arc_milestone
```

StateProposal状态：

```text
pending | accepted | edited | rejected
```

StateProposal来源：

```text
rule | provider_stub
```

`pending`只表示待作者裁决的候选，不改变EntityState或ArcMilestone。EntityState提案可携带`validUntilChapterId`；非空终点必须属于同项目、保持活动状态并严格位于提案章节之后，采用`[chapterId, validUntilChapterId)`半开语义。`accept`使用提议值，`edit_accept`使用作者编辑后的合法JSON值，两者都保留提案终点；`reject`不产生权威写入。一批裁决任一失败时整批回滚。接受`entity_state`会结束旧current并写入带相同终点的新current；接受`arc_milestone`会以`confirmationSource=state_proposal`推进节点，并在同一事务重建章节尾快照。

EndingSnapshot状态：

```text
valid | stale
```

有效快照按章节和来源Version可追溯；缺失或stale时读取来源为`fallback_live_query`，内容来自权威当前表。DerivedInvalidation记录上游语义变化影响的后续章节与`continuity/arc/timeline/foreshadowing/validation/cache`范围；纯`prose`修改不产生失效记录。

Foreshadowing状态：

```text
planned | planted | reinforced | partially_revealed | revealed | cancelled
```

Foreshadowing章节角色：

```text
plant | reinforce | partial_reveal | reveal | reference
```

Foreshadowing关系：

```text
depends_on | blocks | mutually_exclusive | reinforces
```

回收窗口按章节顺序使用包含起点和终点的提示语义；超过终点且未解决时标记overdue。`depends_on`和`blocks`目标未进入revealed/cancelled时显示blocked；`reinforces`只提供软关联。Core拒绝依赖循环、自依赖以及两个已激活伏笔之间新增或触发的互斥冲突。

CharacterArc类型：

```text
growth | darkening | awakening | fall | redemption | custom
```

CharacterArc状态：

```text
planned | active | completed | abandoned
```

ArcMilestone状态：

```text
planned | hit | skipped
```

ArcMilestone确认来源：

```text
author | state_proposal
```

节点可依赖同项目ArcMilestone或TimelineEvent；节点依赖必须先hit，里程碑按`sortIndex, id`确定性排序。M3-05公开写入口只接受author权限；AI不能创建、修改或推进伏笔、人物弧光和弧光节点权威状态。`pending`弧光提案不能提前改变ArcMilestone状态。

## 5. AI、Prompt与任务

| 名称 | 定义 |
|---|---|
| Provider | 外部API或用户已运行本地服务的协议适配配置 |
| GenerationRun | 一次AI任务的生命周期和可追溯记录 |
| requestId | 命令级幂等ID，不等同于Run ID |
| ConstraintPackage | 某次任务实际使用的结构化上下文包 |
| PromptDefinition | 有稳定promptId和整数version的Prompt定义 |
| ModelSupportProfile | Provider、模型、任务、Prompt版本组合的支持档案 |
| partial Candidate | 中断或取消后保存的不完整候选，不能直接定稿 |

GenerationRun类型：

```text
skeleton | chapter | rewrite | merge | validate | state_extract
```

GenerationRun状态：

```text
queued | running | succeeded | failed | cancelled
```

约束优先级：

| 层级 | 内容 |
|---|---|
| P0 | 代码硬约束：项目、Revision、锁定和不可变Version |
| P1 | 本章必须发生的事件、SceneBeat和前章尾状态 |
| P2 | 高相关设定、当前状态、知情、伏笔和弧光阶段 |
| P3 | 文风、角色声音和表现要求 |
| P4 | 可裁剪辅助背景 |

## 6. 校验、搜索与节奏

| 名称 | 定义 |
|---|---|
| ValidationIssue | 有类型、严重度、正文锚点、依据和建议的问题记录 |
| deterministic check | 相同输入必须得到相同结果的规则校验 |
| statistical check | 对句长、比例、密度和字数进行统计的校验 |
| semantic check | AI生成的有证据风险提示，不是权威裁决 |
| StoryTodo | 绑定章节、SceneBeat或文本块的修订任务 |
| Comment | 绑定对象或文本块的轻量批注 |
| ProjectDictionary | 专名、别名、忽略和替换建议词典 |
| FTS5 index | 可重建的全文检索派生索引 |
| ReplacePlan | 批量替换预览及命中基线，提交前重新校验 |
| GenreRhythmProfile | 作者可编辑的品类节奏参考区间 |

ValidationIssue状态：

```text
open | ignored_chapter | silenced_project | downgraded | false_positive | resolved | stale
```

节奏建议等级固定为P3，可关闭，不阻断写作。

## 7. 导入、导出与备份

| 名称 | 定义 |
|---|---|
| ImportPlan | 临时导入预览，不修改项目真源 |
| export Version | 被选中用于导出的不可变Version |
| daily backup | 日常滚动备份 |
| operation checkpoint | Migration、导入、替换和结构操作前的恢复点 |
| manual snapshot | 作者命名的长期快照 |
| verified backup | 通过完整性检查和Hash验证的备份 |
| restore copy | 从备份恢复到新目录的新项目副本 |
| TrashEntry | 软删除对象原位置与恢复信息 |

## 8. UI术语映射

| 工程术语 | 默认用户文案 |
|---|---|
| Draft | 当前稿 |
| Candidate | AI建议稿 / 备选稿 |
| Version | 历史版本 / 定稿版本 |
| GenerationRun | AI任务 |
| EntityState | 当前状态 |
| TimelineEvent | 时间线事件 |
| KnowledgeState | 知情状态 |
| StateProposal | 状态变化建议 |
| CharacterArc | 人物弧光 |
| ArcMilestone | 弧光节点 |
| ValidationIssue | 检查问题 |
| stale | 需要重新检查 |

## 9. P1与V1.5数据

研究笔记、附件、项目日记、L0—L5自动记忆和语义向量索引不属于V1.0 P0初始Schema。启动对应P1/V1.5任务时再增加术语、表和Migration。
