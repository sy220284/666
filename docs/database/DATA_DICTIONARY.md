# WorldForge 数据字典

> 状态：Approved  
> 本文统一项目内核心术语、实体、字段语义和状态枚举。字段结构以`DATABASE_SCHEMA.md`为准。

## 1. 通用字段

| 字段 | 语义 |
|---|---|
| `id` | 当前记录唯一标识，通常为UUID |
| `project_id` | 数据所属项目；所有项目级写入必须校验 |
| `created_at` | ISO-8601创建时间 |
| `updated_at` | ISO-8601最近修改时间 |
| `deleted_at` | 软删除时间；非空表示进入回收站 |
| `order_key` | 同一父节点下的稳定排序键 |
| `content_hash` | 标准化内容Hash，用于冲突和完整性校验 |
| `status` | 领域状态，具体枚举见对应实体 |
| `source_id` | 来源记录ID |
| `source_type` | 来源类别，如Version、Block、Author或Import |

## 2. 项目与规划

| 名称 | 定义 |
|---|---|
| Project | 单部作品的完整本地工程，拥有独立`project.sqlite` |
| ProjectBrief | 全书最高层但简洁的创作任务书 |
| Volume | 卷级容器 |
| Chapter | 章节实体，关联活动Draft和定稿Version |
| PlotNode | 大纲层级节点，可表示卷、剧情弧或章节规划 |
| SceneBeat | 章节内场景节拍，包含目标、冲突、结果和必选标记 |
| active Draft | 当前唯一可编辑的章节正文 |
| final Version | 当前被作者确认的章节定稿版本 |

### Chapter状态

```text
pending → outlined → writing → reviewing → finalized
```

允许从finalized恢复出新Draft继续返修，但历史final Version不变。

## 3. 正文与版本

| 名称 | 定义 |
|---|---|
| Draft | 当前可编辑工作稿，每章最多一个活动Draft |
| DraftBlock | Draft中的结构化文本块 |
| logicalBlockId | 跨Draft、Candidate和Version追踪同一逻辑段落的稳定标识 |
| Revision | Draft每次原子提交后的递增版本号，不等同于完整快照 |
| Block Patch | 对块进行插入、更新、删除或移动的结构化操作 |
| expectedHash | Patch生成时目标块的内容Hash |
| Candidate | AI生成或融合后的备选结果，未经确认不进入Draft |
| Version | 不可变历史快照 |
| ApplyRecord | Candidate采用动作及其选择、Revision和回退信息 |
| Checkpoint | 高风险操作前创建的可恢复状态 |

### Block类型

```text
paragraph | dialogue | heading | separator
```

### Block来源

```text
manual | ai | mixed | imported
```

### Candidate类型

```text
skeleton | full | rewrite | merge
```

### Candidate状态

```text
pending | accepted | discarded
```

### Candidate完整度

```text
complete | partial
```

## 4. 设定与连续性

| 名称 | 定义 |
|---|---|
| Entity | 人物、地点、势力、道具、能力、规则、事件或自定义对象 |
| CanonFact | 作者确认的稳定事实，AI不能直接修改 |
| EntityState | 随剧情变化的动态状态记录 |
| current state | 当前章节时间点仍有效的状态 |
| historical state | 曾经有效、现已被覆盖的状态 |
| evidence | 支撑设定或状态的正文块、Version或作者输入引用 |
| TimelineEvent | 有起止、精度、人物、地点和依赖的事件 |
| KnowledgeState | 人物对信息的知道、相信、怀疑、误解或未知状态 |
| Foreshadowing | 有埋设、强化、揭示和取消生命周期的伏笔 |
| EndingSnapshot | 章节定稿后供下一章快速读取的连续性入口 |
| stale | 派生数据因上游修改而过期，不能继续当作有效输入 |
| StateProposal | AI或规则生成的动态状态变化候选 |

### Entity类型

```text
character | location | faction | item | ability | rule | event | custom
```

### EntityState状态

```text
current | historical | superseded | invalid
```

### StateProposal状态

```text
pending | accepted | edited | rejected
```

### KnowledgeState状态

```text
knows | believes | suspects | misunderstands | unknown
```

### Foreshadowing状态

```text
planned | planted | reinforced | partially_revealed | revealed | cancelled
```

## 5. AI与约束

| 名称 | 定义 |
|---|---|
| Provider | 外部API或用户已运行本地服务的协议适配配置 |
| GenerationRun | 一次AI任务的生命周期记录 |
| requestId | 防止同一用户命令重复执行的幂等ID |
| ConstraintPackage | 某次AI任务实际使用的结构化上下文包 |
| PromptVersion | Prompt模板版本，与模型Eval绑定 |
| ModelSupportProfile | Provider、模型、任务和Prompt版本组合的支持档案 |
| partial Candidate | 中断或取消后保存的不完整候选，不可直接定稿 |

### GenerationRun类型

```text
skeleton | chapter | rewrite | merge | validate | state_extract
```

### GenerationRun状态

```text
queued | running | succeeded | failed | cancelled
```

### 约束优先级

| 层级 | 内容 |
|---|---|
| P0 | 代码硬约束：项目、Revision、锁定、不可变Version |
| P1 | 本章必须发生的事件、节拍和前章尾状态 |
| P2 | 高相关设定、当前状态、知情和伏笔 |
| P3 | 文风、角色声音和表现要求 |
| P4 | 可裁剪辅助背景 |

## 6. 校验、搜索和修订

| 名称 | 定义 |
|---|---|
| ValidationIssue | 有类型、严重度、正文锚点、依据和建议的问题记录 |
| deterministic check | 相同输入必须得到相同结果的规则校验 |
| statistical check | 对句长、比例、密度等进行统计的校验 |
| semantic check | AI生成的语义风险提示，不是权威裁决 |
| StoryTodo | 绑定章节、场景或文本块的轻量修订任务 |
| project dictionary | 项目专名、忽略词和替换建议词典 |
| FTS5 index | 可重建的全文检索派生索引 |
| ReplacePlan | 批量替换预览及命中基线，提交前需重新校验 |

### ValidationIssue状态

```text
open | ignored_chapter | silenced_project | downgraded | false_positive | resolved | stale
```

## 7. 导入、导出和备份

| 名称 | 定义 |
|---|---|
| ImportPlan | 解析后的临时导入预览，不修改项目真源 |
| export Version | 被选中用于导出的不可变Version |
| daily backup | 日常滚动备份 |
| operation checkpoint | Migration、导入、替换和结构操作前的长期恢复点 |
| manual snapshot | 作者命名的永久快照 |
| verified backup | 通过数据库完整性检查和Hash验证的备份 |
| restore copy | 从备份恢复到新目录的新项目副本 |
| TrashEntry | 软删除对象原位置与恢复信息 |

## 8. UI术语映射

工程术语与用户界面文案分离：

| 工程术语 | 默认用户文案 |
|---|---|
| Draft | 当前稿 |
| Candidate | AI建议稿 / 备选稿 |
| Version | 历史版本 / 定稿版本 |
| GenerationRun | AI任务 |
| EntityState | 当前状态 |
| StateProposal | 状态变化建议 |
| ValidationIssue | 检查问题 |
| stale | 需要重新检查 |

## 9. 时间与字数

- 所有持久化时间使用UTC ISO-8601；界面按本地时区展示。
- 字数至少提供“正文字符数”和“纯文字字数”两个稳定口径。
- 统计口径必须在编辑器、章节列表、统计和导出预览中一致。

## 10. 空值规则

- 未知与空字符串不同；未知使用NULL或显式状态。
- 用户跳过可选设定时不填伪默认值。
- AI无法确定时不得用猜测填入Canon或当前状态。
