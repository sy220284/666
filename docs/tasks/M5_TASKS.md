# WorldForge 原M5 AI生成与候选审阅需求摘要

> 状态：Absorbed by M4-04  
> 用途：保留AI写作与候选审阅详细需求；不得作为独立任务执行入口。

## 执行归属

原M5-00—M5-06全部由[M4-04 V1剩余功能整体实施与发布闭环](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)吸收，在同一活动任务、同一正式分支和同一长期Draft PR内连续实施。

原任务文件保留详细目标、非目标、数据合同、测试和完成条件。`Removed（absorbed）`只取消独立激活、分支、PR和关闭流程，不取消任何需求。

## 需求范围

| 原ID | 需求来源 | 统一实施内容 |
|---|---|---|
| M5-00 | [作者工作流与产品体验收口](M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md) | 作者语言、继续写作、正文中心、设定表单、结构操作可视化与单一模式状态。 |
| M5-01 | [T0多候选骨架](M5/M5-01_T0_SKELETON.md) | Skeleton/Prose判别模型、结构化骨架、Hash、修订追溯和类型守卫。 |
| M5-02 | [T1章节扩写](M5/M5-02_T1_CHAPTER_GENERATION.md) | Skeleton、SceneBeat、直接章节目标三种互斥来源与Prose Candidate生成。 |
| M5-03 | [快速改写与结构性改写](M5/M5-03_REWRITE_WORKFLOWS.md) | 选区锚点、持久化rewrite Candidate、结构性改写与安全采用。 |
| M5-04 | [多候选融合与部分结果恢复](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md) | Beat/Segment融合、partial继续、补全、保存与丢弃。 |
| M5-05 | [候选审阅、采用与冲突工作台](M5/M5-05_CANDIDATE_REVIEW_APPLY.md) | Skeleton比较、Prose审阅、Diff、冲突、采用、撤销和来源追溯。 |
| M5-06 | [真实状态提取与StateProposal接入](M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md) | Final Version状态提取、StateProposalBatch、pending提案和作者裁决。 |

## 统一退出要求

- 作者工作流、T0/T1、改写、融合、审阅、采用、撤销和状态提取形成完整纵向闭环。
- Skeleton进入正文Preview、Diff、Apply、Version或定稿的成功次数为0。
- T0可绕过，T1每次恰好一种来源。
- 所有AI正文结果先成为持久化Prose Candidate；失败和取消不改变Draft。
- partial不得默认整稿采用或直接定稿。
- 真实状态提取只形成pending StateProposal，AI不得直接写权威状态。
- 相关验收统一进入`docs/test-evidence/M4-04/`和P0矩阵。
