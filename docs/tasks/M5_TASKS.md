# WorldForge M5 AI生成与候选审阅任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

先完成作者工作流与产品体验收口，再完成结构化T0、三路径T1、持久化改写、融合、候选审阅、采用、撤销和真实状态提取的作者可控AI闭环。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M5-00 | [作者工作流与产品体验收口](M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md) | M4 | 统一作者语言、继续写作、基础工作台、设定编辑和高风险结构操作体验；完整向导留给M7-01。 |
| M5-01 | [T0多候选骨架](M5/M5-01_T0_SKELETON.md) | M5-00、M4-05 | 扩展结构化Skeleton Candidate，支持无损持久化、编辑和T1读取，禁止进入正文Apply。 |
| M5-02 | [T1章节扩写](M5/M5-02_T1_CHAPTER_GENERATION.md) | M5-01 | 支持Skeleton、权威SceneBeat和直接章节目标三条路径生成Prose Candidate。 |
| M5-03 | [快速改写与结构性改写](M5/M5-03_REWRITE_WORKFLOWS.md) | M5-02、M2-03 | 所有快速和结构性改写先形成持久化Candidate，再复用M2-03安全采用。 |
| M5-04 | [多候选融合与部分结果恢复](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md) | M5-02、M5-03 | 按SceneBeat融合Prose Candidate，并提供继续生成、手动补全、保存或丢弃partial的作者流程。 |
| M5-05 | [候选审阅、采用与冲突工作台](M5/M5-05_CANDIDATE_REVIEW_APPLY.md) | M5-01、M5-02、M5-03、M5-04、M2-03 | 统一Skeleton比较、Prose审阅、冲突、采用和撤销，展示Run、Prompt和约束来源。 |
| M5-06 | [真实状态提取与StateProposal接入](M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md) | M5-05、M3-06 | 将Final Version经真实Provider提取为pending StateProposal，复用作者裁决与快照闭环。 |

## 阶段退出门

- M5-00产品体验门已Verified，普通作者无需理解工程术语即可完成基础首次写作与日常续写。
- Skeleton结构化语义无损持久化，进入正文Diff、Apply或Version的成功次数为0。
- T0可绕过，T1三条输入路径均真实可用。
- 所有AI正文结果先成为持久化Prose Candidate，失败和取消不改变Draft。
- partial不会被误当完整稿、默认整稿采用或直接定稿。
- Final Version→state_extract→pending StateProposal→作者裁决闭环可用，AI不直接写权威状态。
- 长章节Diff和审阅性能达到预算或有明确降级。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- M5-00未Verified前不得激活M5-01或提前叠加AI生成入口。
- M5-01未建立Skeleton类型守卫前不得开放骨架审阅与T1入口。
- M5-06未完成前不得宣称真实Provider状态提取闭环。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
