# WorldForge V1.0 任务索引

> 状态：Active  
> 基线：WorldForge V6.5  
> 独立任务体系：M0—M3与M4-01—M4-04，共34张独立任务卡。  
> 当前执行：M4-04为V1剩余功能唯一整体任务；原M4-05—M8-03已吸收为需求来源，不再独立激活。

## 1. 唯一执行入口

1. [`ACTIVE_TASK.json`](ACTIVE_TASK.json)：机器可读的唯一活动任务状态与授权。
2. [`ACTIVE_TASK.md`](ACTIVE_TASK.md)：由JSON生成的人类可读镜像。
3. ACTIVE_TASK指向的唯一整体任务卡。
4. [`M4/M4-04_INTEGRATED_IMPLEMENTATION_PLAN.md`](M4/M4-04_INTEGRATED_IMPLEMENTATION_PLAN.md)：编码前必须完成的整体规划。
5. [`M4/M4-04_ABSORBED_REQUIREMENTS.md`](M4/M4-04_ABSORBED_REQUIREMENTS.md)：被吸收需求来源清单。
6. [`../PROJECT_EXECUTION_ENTRY.md`](../PROJECT_EXECUTION_ENTRY.md)：专项文档路由。

任务状态：

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

`Removed（absorbed by M4-04）`只取消原任务的独立执行形式，不取消其需求、测试和验收要求。

## 2. 执行总览

| 阶段 | 定位 | 独立任务数 | 当前结果 |
|---|---|---:|---|
| M0 | 工程、安全与运行底座 | 7 | Verified |
| M1 | 基础写作MVP | 9 | Verified |
| M2 | 编辑安全与版本核心 | 4 | Verified |
| M3 | 规划、设定与连续性 | 10 | Verified |
| M4 | 已完成AI基础 + V1剩余整体交付 | 4 | M4-01—M4-03 Verified；M4-04 In Progress |
| 原M5—M8 | AI写作、校验交付、体验整合、发布验收 | 0 | 全部作为M4-04内部实施阶段与需求来源 |

```text
M0—M3 已完成产品底座
→ M4-01 FTS
→ M4-02 约束包
→ M4-03 Provider
→ M4-04 V1剩余功能整体实施与发布闭环
```

## M0 工程、安全与运行底座

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [`Monorepo、质量工具与CI`](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Verified |
| M0-02 | [`Electron安全壳与Core生命周期`](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Verified |
| M0-03 | [`SQLite、Migration与单写队列`](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | M0-01 | Verified |
| M0-04 | [`IPC、错误码、事件与任务协议`](M0/M0-04_IPC_EVENT_TASK_PROTOCOL.md) | M0-02、M0-03 | Verified |
| M0-05 | [`测试基建、Fixture与故障注入`](M0/M0-05_TESTKIT_FAULT_INJECTION.md) | M0-01、M0-02、M0-03、M0-04 | Verified |
| M0-06 | [`显示、DPI与窗口恢复Spike`](M0/M0-06_DISPLAY_WINDOW_SPIKE.md) | M0-02、M0-03、M0-05 | Verified |
| M0-07 | [`AI输出协议与中文Diff Spike`](M0/M0-07_AI_DIFF_SPIKE.md) | M0-03、M0-04、M0-05 | Verified |

## M1 基础写作MVP

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M1-01 | [`app.sqlite、应用设置与最近项目`](M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md) | M0 | Verified |
| M1-02 | [`项目工作空间、路径边界与只读打开`](M1/M1-02_PROJECT_WORKSPACE_PATHS.md) | M1-01 | Verified |
| M1-03 | [`卷与章节基础生命周期`](M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md) | M1-02 | Verified |
| M1-04 | [`Draft、Tiptap与中文输入`](M1/M1-04_DRAFT_EDITOR_IME.md) | M1-03 | Verified |
| M1-05 | [`Block Patch、内容Hash与Revision`](M1/M1-05_BLOCK_PATCH_REVISION.md) | M1-04 | Verified |
| M1-06 | [`自动保存、字数与当前章查找`](M1/M1-06_AUTOSAVE_STATS_FIND.md) | M1-05 | Verified |
| M1-07 | [`手动Version、定稿与历史恢复`](M1/M1-07_MANUAL_VERSION_FINALIZE.md) | M1-06 | Verified |
| M1-08 | [`基础恢复点、完整性检查与只读恢复`](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02、M0-03 | Verified |
| M1-09 | [`TXT与Markdown基础导入导出`](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md) | M1-07、M1-08 | Verified |

## M2 编辑安全与版本核心

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M2-01 | [`锁定块与Core LockGuard`](M2/M2-01_LOCK_GUARD.md) | M1-05 | Verified |
| M2-02 | [`Candidate与完整Version模型`](M2/M2-02_CANDIDATE_VERSION_MODEL.md) | M1-07、M2-01 | Verified |
| M2-03 | [`Diff、冲突、采用与持久化撤销`](M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md) | M2-02 | Verified |
| M2-04 | [`回收站、拆章、并章与结构恢复`](M2/M2-04_TRASH_STRUCTURE_RECOVERY.md) | M2-03、M1-08 | Verified |

## M3 规划、设定与连续性

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M3-01 | [`作品任务书与大纲树`](M3/M3-01_PROJECT_BRIEF_OUTLINE.md) | M2 | Verified |
| M3-02 | [`SceneBeat、场景关联与跨章移动`](M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md) | M3-01、M2-04 | Verified |
| M3-03 | [`通用实体与静态Canon`](M3/M3-03_ENTITY_CANON.md) | M3-01 | Verified |
| M3-04 | [`动态状态、时间线与知情信息`](M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md) | M3-02、M3-03 | Verified |
| M3-05 | [`伏笔生命周期与人物弧光`](M3/M3-05_FORESHADOWING_CHARACTER_ARC.md) | M3-04 | Verified |
| M3-06 | [`状态提案、定稿、尾快照与失效传播`](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | Verified |
| M3-07 | [`Renderer迁移基础与React底座`](M3/M3-07_RENDERER_REACT_FOUNDATION.md) | M3-06 | Verified |
| M3-08 | [`React运行底座、Renderer壳层、首页、项目与设置迁移`](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md) | PR #125 Checkpoint | Verified |
| M3-09 | [`Renderer规划、设定、结构与数据工具迁移`](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md) | M3-08 | Verified |
| M3-10 | [`Renderer写作、Version、Candidate迁移与旧入口退役`](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09 | Verified |

## M4 已完成AI基础与唯一整体任务

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M4-01 | [`FTS5公共索引、队列与项目词典`](M4/M4-01_FTS_INDEX_DICTIONARY.md) | M3 | Verified |
| M4-02 | [`P0—P4约束包与裁剪追溯`](M4/M4-02_CONSTRAINT_PACKAGE.md) | M4-01、M3-06 | Verified |
| M4-03 | [`Provider、凭据与连接测试`](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0-02、M0-04、M0-05 | Verified |
| M4-04 | [`V1剩余功能整体实施与发布闭环`](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-01、M4-02、M4-03、M0-07 | In Progress |

## 3. 已吸收的需求来源

以下文件不参与机器任务解析和活动任务切换；完整映射见[`M4-04_ABSORBED_REQUIREMENTS.md`](M4/M4-04_ABSORBED_REQUIREMENTS.md)。

| 原ID | 来源文件 | 原阶段 | 独立执行状态 | 统一归属 |
|---|---|---|---|---|
| M4-05 | [`GenerationRun、流式运行与模型支持档案`](M4/M4-05_GENERATION_RUNTIME_EVAL.md) | M4 | Removed（absorbed） | M4-04 |
| M5-00 | [`作者工作流与产品体验收口`](M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md) | M5 | Removed（absorbed） | M4-04 |
| M5-01 | [`T0多候选骨架`](M5/M5-01_T0_SKELETON.md) | M5 | Removed（absorbed） | M4-04 |
| M5-02 | [`T1章节扩写`](M5/M5-02_T1_CHAPTER_GENERATION.md) | M5 | Removed（absorbed） | M4-04 |
| M5-03 | [`快速改写与结构性改写`](M5/M5-03_REWRITE_WORKFLOWS.md) | M5 | Removed（absorbed） | M4-04 |
| M5-04 | [`多候选融合与部分结果恢复`](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md) | M5 | Removed（absorbed） | M4-04 |
| M5-05 | [`候选审阅、采用与冲突工作台`](M5/M5-05_CANDIDATE_REVIEW_APPLY.md) | M5 | Removed（absorbed） | M4-04 |
| M5-06 | [`真实状态提取与StateProposal接入`](M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md) | M5 | Removed（absorbed） | M4-04 |
| M6-01 | [`确定性/统计校验与修订待办`](M6/M6-01_RULE_STATS_VALIDATION_TODOS.md) | M6 | Removed（absorbed） | M4-04 |
| M6-02 | [`AI语义与人物弧光一致性校验`](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md) | M6 | Removed（absorbed） | M4-04 |
| M6-03 | [`全项目搜索与安全批量替换`](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md) | M6 | Removed（absorbed） | M4-04 |
| M6-04 | [`网文节奏与连载指标`](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md) | M6 | Removed（absorbed） | M4-04 |
| M6-05 | [`DOCX安全导入与多格式导出`](M6/M6-05_DOCX_TRANSFER.md) | M6 | Removed（absorbed） | M4-04 |
| M6-06 | [`三轨备份、恢复中心与空间清理`](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md) | M6 | Removed（absorbed） | M4-04 |
| M7-01 | [`新手/专业模式、向导与三条创作路径`](M7/M7-01_ONBOARDING_MODES_PATHS.md) | M7 | Removed（absorbed） | M4-04 |
| M7-02 | [`统一工作台、沉浸视图与交互状态`](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md) | M7 | Removed（absorbed） | M4-04 |
| M7-03 | [`双视觉主题、无障碍与响应式验收`](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md) | M7 | Removed（absorbed） | M4-04 |
| M8-01 | [`安全、数据、Migration与隐私硬化`](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | M8 | Removed（absorbed） | M4-04 |
| M8-02 | [`性能、E2E、显示与AI Eval验收`](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | M8 | Removed（absorbed） | M4-04 |
| M8-03 | [`跨平台构建、P0追踪与发布关闭`](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | M8 | Removed（absorbed） | M4-04 |

## 4. 整体任务阶段门

1. M4-04编码前必须完成整体实施计划，逐项核实全部需求、代码、测试、Migration、IPC和追踪状态。
2. 已完成任务卡、历史Evidence和历史Migration保持冻结；兼容扩展由M4-04承接。
3. M4-04内部阶段不得建立独立活动任务、正式功能PR或旁路状态。
4. 每项用户功能必须完成Contracts→Core→Main→Preload→Renderer→测试的实际纵向闭环；无影响层必须明确记录。
5. 共享Prompt、TaskProtocol、Candidate采用、导入协调器、RecoveryService、模式状态和主题状态只允许一个真源。
6. 内部阶段合并前不允许出现需依赖后续阶段才能恢复、迁移或解释的数据。
7. 长期PR在全部功能完成前保持Draft；全部V1功能、测试、文档和证据完成后才能转Ready。
8. M4-04是V1最终任务；Verified关闭后不自动激活下一任务。

## 5. 执行规则

1. 正式分支：`work/m4-04-v1-integrated-delivery`。
2. 正式PR：一个长期Draft PR，最终只保留一个受检Head。
3. 内部阶段使用原子提交组；每组完成后复查真实Head、运行受影响测试并更新整体计划。
4. M4-04允许路径由`ACTIVE_TASK.json`统一授权；已完成任务卡列入禁止路径。
5. 最终证据统一保存到`docs/test-evidence/M4-04/`，原被吸收任务不再独立关闭。
6. M4-04完成后一次性同步追踪矩阵、P0矩阵、功能目录、README、发布与恢复文档。
