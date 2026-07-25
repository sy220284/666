# WorldForge M5 AI生成与候选审阅任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

先按垂直切片完成作者工作流与产品体验收口，再完成结构化T0、互斥三路径T1、持久化改写、节拍/片段融合、候选审阅、采用、撤销和真实状态提取的作者可控AI闭环。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M5-00 | [作者工作流与产品体验收口](M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md) | M4 | 按作者语言与状态真源、继续写作、正文/设定、高风险结构操作四个切片收口；完整向导与显示终验留给M7。 |
| M5-01 | [T0多候选骨架](M5/M5-01_T0_SKELETON.md) | M5-00、M4-05 | 建立Skeleton/Prose判别合同、结构化Hash、修订追溯和类型守卫，禁止骨架进入正文链路。 |
| M5-02 | [T1章节扩写](M5/M5-02_T1_CHAPTER_GENERATION.md) | M5-01 | Skeleton、权威SceneBeat和直接章节目标三条来源每次恰好一种，统一生成Prose Candidate。 |
| M5-03 | [快速改写与结构性改写](M5/M5-03_REWRITE_WORKFLOWS.md) | M5-02、M2-03 | 段内选区使用Revision/Hash/范围锚点并重建完整块Candidate，再复用M2-03安全采用。 |
| M5-04 | [多候选融合与部分结果恢复](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md) | M5-02、M5-03 | 有SceneBeat使用Beat映射，无SceneBeat使用受控Segment映射；提供partial继续、补全、保存或丢弃流程。 |
| M5-05 | [候选审阅、采用与冲突工作台](M5/M5-05_CANDIDATE_REVIEW_APPLY.md) | M5-01、M5-02、M5-03、M5-04、M2-03 | 统一Skeleton比较、Prose审阅、冲突、采用和撤销，展示Run、Prompt和约束来源；完整显示终验留给M7-03。 |
| M5-06 | [真实状态提取与StateProposal接入](M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md) | M5-05、M3-06 | Final Version经真实Provider生成StateProposalBatch与pending Proposal，完整关联GenerationRun并复用作者裁决。 |

## 阶段退出门

- M5-00四个产品体验切片已Verified，普通作者无需理解工程术语即可完成基础首次写作与日常续写。
- Skeleton结构化语义无损持久化且Hash可校验，进入正文Preview、Diff、Apply或Version的成功次数为0。
- T0可绕过；T1三条输入路径均真实可用，每个Run恰好一种来源。
- 所有AI正文结果先成为持久化Prose Candidate，失败和取消不改变Draft。
- 段内选区改写不存在逐字符采用旁路；过期锚点只进入冲突。
- 无SceneBeat Candidate可通过受控Segment模式融合，不伪造SceneBeat。
- partial不会被误当完整稿、默认整稿采用或直接定稿。
- Final Version→state_extract→StateProposalBatch→pending StateProposal→作者裁决闭环可用，AI不直接写权威状态。
- 长章节Diff和审阅性能达到预算或有明确降级。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- M5-00未Verified前不得激活M5-01或提前叠加AI生成入口。
- M5-01未建立Skeleton判别合同和类型守卫前不得开放骨架审阅与T1入口。
- M5-02不得接受零来源、多来源或Renderer提交的权威全文。
- M5-06未完成前不得宣称真实Provider状态提取闭环。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
