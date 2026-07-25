# M4-04 被吸收需求来源清单

> 执行归属：M4-04 WorldForge V1剩余功能整体实施与发布闭环  
> 独立激活：禁止  
> 状态来源：`docs/tasks/TASK_INDEX.md`

## 规则

以下文件保留原始目标、非目标、合同、测试与完成条件，继续作为M4-04的详细需求来源；它们不再是独立活动任务，不建立独立分支、PR、状态转换或Evidence关闭。

实施时不得因“已吸收”而删除任何要求。M4-04整体计划必须将每项要求映射到代码、内部阶段、测试、P0验收与统一证据。

## 来源清单

| 原ID | 需求来源文件 | 吸收范围 |
|---|---|---|
| M4-05 | `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md` | GenerationRun、流式运行、结果引用、partial、模型支持档案 |
| M5-00 | `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md` | 作者语言、继续写作、正文中心、设定表单、结构操作可视化 |
| M5-01 | `docs/tasks/M5/M5-01_T0_SKELETON.md` | Skeleton/Prose判别模型、T0、多候选骨架与类型守卫 |
| M5-02 | `docs/tasks/M5/M5-02_T1_CHAPTER_GENERATION.md` | T1三种互斥来源与Prose Candidate生成 |
| M5-03 | `docs/tasks/M5/M5-03_REWRITE_WORKFLOWS.md` | 快速改写、选区锚点与结构性改写 |
| M5-04 | `docs/tasks/M5/M5-04_CANDIDATE_MERGE_PARTIAL.md` | Beat/Segment融合、partial处理与继续生成 |
| M5-05 | `docs/tasks/M5/M5-05_CANDIDATE_REVIEW_APPLY.md` | 候选审阅、Diff、冲突、安全采用与撤销 |
| M5-06 | `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md` | 真实状态提取、StateProposalBatch与作者裁决接线 |
| M6-01 | `docs/tasks/M6/M6-01_RULE_STATS_VALIDATION_TODOS.md` | 确定性/统计校验、ValidationIssue、待办与批注 |
| M6-02 | `docs/tasks/M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md` | AI语义、设定、知情、伏笔与人物弧光校验 |
| M6-03 | `docs/tasks/M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md` | 全项目搜索、安全ReplacePlan与项目词典 |
| M6-04 | `docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md` | mutationOrigin、人工写作统计与网文节奏指标 |
| M6-05 | `docs/tasks/M6/M6-05_DOCX_TRANSFER.md` | DOCX安全导入与多格式Version导出 |
| M6-06 | `docs/tasks/M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md` | 三轨备份、配额清理、恢复中心与新副本恢复 |
| M7-01 | `docs/tasks/M7/M7-01_ONBOARDING_MODES_PATHS.md` | 首次向导、新手/专业披露与三条创作路径 |
| M7-02 | `docs/tasks/M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md` | 统一工作台、StatusArbiter、帮助与返回原位置 |
| M7-03 | `docs/tasks/M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md` | 双视觉主题、无障碍、响应式与DPI终验 |
| M8-01 | `docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md` | 安全、数据、Migration、隐私与AI边界硬门 |
| M8-02 | `docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md` | 性能、Electron E2E、显示矩阵与AI Eval终验 |
| M8-03 | `docs/tasks/M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md` | 三平台构建、P0追踪、文档同步与发布判断 |

## 状态语义

- `Removed（absorbed by M4-04）`表示取消独立执行形式，不表示取消需求。
- 原任务ID继续用于需求追踪、历史讨论和验收定位。
- 所有实现状态统一记录在M4-04整体任务、整体实施计划和统一证据中。
- 任何遗漏原来源要求的实现都不能关闭M4-04。
