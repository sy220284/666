# WorldForge 任务索引

> 状态：Active  
> 基线：WorldForge V6.5  
> 独立任务体系：M0—M3、M4-01—M4-04、M8-02、M8-04—M8-09及M9-00—M9-14，共56张独立任务卡或冻结工作包。
> 当前任务：M9-00与M9-01已Verified；M9-02 Shared Structure已Implemented，等待永久门禁与受控合并。

## 1. 执行入口

1. [`TASK_AUTHORIZATION.json`](TASK_AUTHORIZATION.json)：多任务全局授权与main串行写入规则。
2. [`runtime/`](runtime/)：每张活动任务的独立机器状态。
3. [`ACTIVE_TASK.json`](ACTIVE_TASK.json)与[`ACTIVE_TASK.md`](ACTIVE_TASK.md)：历史关闭流程兼容锚点。
4. M8-09终态任务卡：[`M8/M8-09_V1_STABILITY_HARDENING.md`](M8/M8-09_V1_STABILITY_HARDENING.md)。
5. M9任务入口：[`M9/README.md`](M9/README.md)。
6. [`../PROJECT_EXECUTION_ENTRY.md`](../PROJECT_EXECUTION_ENTRY.md)：专项文档路由。

任务状态：

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

`Removed（absorbed）`只取消原任务的独立执行形式，不取消其需求、测试和验收要求。

## 2. 执行总览

| 阶段          | 定位                           | 独立任务数 | 当前结果                                     |
| ------------- | ------------------------------ | ---------: | -------------------------------------------- |
| M0            | 工程、安全与运行底座           |          7 | Verified                                     |
| M1            | 基础写作MVP                    |          9 | Verified                                     |
| M2            | 编辑安全与版本核心             |          4 | Verified                                     |
| M3            | 规划、设定与连续性             |         10 | Verified                                     |
| M4            | AI基础与V1核心功能             |          4 | M4-01—M4-04 Verified                         |
| M8            | 交付关闭、作者体验与长期维护   |          7 | M8-02—M8-09 Verified                         |
| M9            | V1.1保持行为的架构拆分治理     |         15 | M9-00—M9-01 Verified；M9-02 Implemented      |
| 原M4-05—M6-06 | AI写作、校验、搜索、导入与恢复 |          0 | 作为M4-04需求来源                            |
| 原M7-01—M8-03 | 体验整合、硬化与发布验收       |          0 | 作为M8-02需求来源，M8-02自身已恢复为独立任务 |

```text
M0—M3 已完成产品底座
→ M4-01 全文搜索
→ M4-02 约束包
→ M4-03 AI连接
→ M4-04 V1核心功能交付（Verified）
→ M8-02 完整体验、硬化与自用交付关闭（Verified）
→ M8-04 作者体验与开发语言统一改造（Verified）
→ M8-05 运行时硬化与文档统一同步（Verified）
→ M8-06 发布资格与任务治理硬化（Verified）
├─ M8-07 中文作者体验治理闭环与产品发布验收硬化（Verified）
├─ M8-08 V1.0最终质量治理与封版闭环（Verified）
└─ M8-09 V1.0稳定性与生命周期治理（Verified）
   → M9-01 重构安全网（Verified）
   → M9-02 Shared Structure（In Progress）
   → M9-03—M9-14按依赖逐包激活
```

## M0 工程、安全与运行底座

| ID    | 任务卡                                                                    | 依赖                       | 状态     |
| ----- | ------------------------------------------------------------------------- | -------------------------- | -------- |
| M0-01 | [`Monorepo、质量工具与CI`](M0/M0-01_MONOREPO_QUALITY_CI.md)               | 无                         | Verified |
| M0-02 | [`Electron安全壳与Core生命周期`](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md)     | M0-01                      | Verified |
| M0-03 | [`SQLite、Migration与单写队列`](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | M0-01                      | Verified |
| M0-04 | [`IPC、错误码、事件与任务协议`](M0/M0-04_IPC_EVENT_TASK_PROTOCOL.md)      | M0-02、M0-03               | Verified |
| M0-05 | [`测试基建、Fixture与故障注入`](M0/M0-05_TESTKIT_FAULT_INJECTION.md)      | M0-01、M0-02、M0-03、M0-04 | Verified |
| M0-06 | [`显示、DPI与窗口恢复Spike`](M0/M0-06_DISPLAY_WINDOW_SPIKE.md)            | M0-02、M0-03、M0-05        | Verified |
| M0-07 | [`AI输出协议与中文Diff Spike`](M0/M0-07_AI_DIFF_SPIKE.md)                 | M0-03、M0-04、M0-05        | Verified |

## M1 基础写作MVP

| ID    | 任务卡                                                                         | 依赖         | 状态     |
| ----- | ------------------------------------------------------------------------------ | ------------ | -------- |
| M1-01 | [`app.sqlite、应用设置与最近项目`](M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md)   | 无           | Verified |
| M1-02 | [`项目工作空间、路径边界与只读打开`](M1/M1-02_PROJECT_WORKSPACE_PATHS.md)      | M1-01        | Verified |
| M1-03 | [`卷与章节基础生命周期`](M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md)                 | M1-02        | Verified |
| M1-04 | [`Draft、Tiptap与中文输入`](M1/M1-04_DRAFT_EDITOR_IME.md)                      | M1-03        | Verified |
| M1-05 | [`Block Patch、内容Hash与Revision`](M1/M1-05_BLOCK_PATCH_REVISION.md)          | M1-04        | Verified |
| M1-06 | [`自动保存、字数与当前章查找`](M1/M1-06_AUTOSAVE_STATS_FIND.md)                | M1-05        | Verified |
| M1-07 | [`手动Version、定稿与历史恢复`](M1/M1-07_MANUAL_VERSION_FINALIZE.md)           | M1-06        | Verified |
| M1-08 | [`基础恢复点、完整性检查与只读恢复`](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02、M0-03 | Verified |
| M1-09 | [`TXT与Markdown基础导入导出`](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md)              | M1-07、M1-08 | Verified |

## M2 编辑安全与版本核心

| ID    | 任务卡                                                                 | 依赖         | 状态     |
| ----- | ---------------------------------------------------------------------- | ------------ | -------- |
| M2-01 | [`锁定块与Core LockGuard`](M2/M2-01_LOCK_GUARD.md)                     | M1-05        | Verified |
| M2-02 | [`Candidate与完整Version模型`](M2/M2-02_CANDIDATE_VERSION_MODEL.md)    | M1-07、M2-01 | Verified |
| M2-03 | [`Diff、冲突、采用与持久化撤销`](M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md) | M2-02        | Verified |
| M2-04 | [`回收站、拆章、并章与结构恢复`](M2/M2-04_TRASH_STRUCTURE_RECOVERY.md) | M2-03、M1-08 | Verified |

## M3 规划、设定与连续性

| ID    | 任务卡                                                                                               | 依赖                       | 状态     |
| ----- | ---------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| M3-01 | [`作品任务书与大纲树`](M3/M3-01_PROJECT_BRIEF_OUTLINE.md)                                            | M2                         | Verified |
| M3-02 | [`SceneBeat、场景关联与跨章移动`](M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md)                              | M3-01、M2-04               | Verified |
| M3-03 | [`通用实体与静态Canon`](M3/M3-03_ENTITY_CANON.md)                                                    | M3-01                      | Verified |
| M3-04 | [`动态状态、时间线与知情信息`](M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md)                                 | M3-02、M3-03               | Verified |
| M3-05 | [`伏笔生命周期与人物弧光`](M3/M3-05_FORESHADOWING_CHARACTER_ARC.md)                                  | M3-04                      | Verified |
| M3-06 | [`状态提案、定稿、尾快照与失效传播`](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md)                            | M3-04、M3-05、M1-07、M2-03 | Verified |
| M3-07 | [`Renderer迁移基础与React底座`](M3/M3-07_RENDERER_REACT_FOUNDATION.md)                               | M3-06                      | Verified |
| M3-08 | [`React运行底座、Renderer壳层、首页、项目与设置迁移`](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md)      | PR #125 Checkpoint         | Verified |
| M3-09 | [`Renderer规划、设定、结构与数据工具迁移`](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md)            | M3-08                      | Verified |
| M3-10 | [`Renderer写作、Version、Candidate迁移与旧入口退役`](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09                      | Verified |

## M4 AI基础与V1核心功能

| ID    | 任务卡                                                                   | 依赖                       | 状态     |
| ----- | ------------------------------------------------------------------------ | -------------------------- | -------- |
| M4-01 | [`FTS5公共索引、队列与项目词典`](M4/M4-01_FTS_INDEX_DICTIONARY.md)       | M3                         | Verified |
| M4-02 | [`P0—P4约束包与裁剪追溯`](M4/M4-02_CONSTRAINT_PACKAGE.md)                | M4-01、M3-06               | Verified |
| M4-03 | [`Provider、凭据与连接测试`](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0-02、M0-04、M0-05    | Verified |
| M4-04 | [`V1核心功能整体实施`](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)               | M4-01、M4-02、M4-03、M0-07 | Verified |

## M8 交付与体验任务

| ID    | 任务卡                                                                                | 依赖                     | 状态     |
| ----- | ------------------------------------------------------------------------------------- | ------------------------ | -------- |
| M8-02 | [`完整体验、硬化与自用交付关闭`](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md)                 | M4-04                    | Verified |
| M8-04 | [`作者体验与开发语言统一改造`](M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md)                | M8-02                    | Verified |
| M8-05 | [`运行时硬化与文档统一同步`](M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md)        | M8-04                    | Verified |
| M8-06 | [`发布资格与任务治理硬化`](M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md)              | M8-05                    | Verified |
| M8-07 | [`中文作者体验治理闭环与产品发布验收硬化`](M8/M8-07_CHINESE_EXPERIENCE_GOVERNANCE.md) | M8-06                    | Verified |
| M8-08 | [`V1.0最终质量治理与封版闭环`](M8/M8-08_V1_FINAL_GOVERNANCE_CLOSURE.md)               | 开发：M8-06；封版：M8-07 | Verified |
| M8-09 | [`V1.0稳定性与生命周期治理`](M8/M8-09_V1_STABILITY_HARDENING.md)                      | M8-08                    | Verified |

## M9 V1.1架构拆分治理

| ID    | 任务卡                                                                                                                           | 依赖                | 状态        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| M9-00 | [`M9激活治理与权威文档同步`](M9/M9-00_ACTIVATION_GOVERNANCE.md)                                                                  | M8-09               | Verified    |
| M9-01 | [`重构安全网`](M9/M9-01_REFACTOR_SAFETY_NET.md)                                                                                  | M8-09               | Verified    |
| M9-02 | [`Shared Structure拆分`](M9/M9-02_SHARED_STRUCTURE.md)                                                                           | M9-00、M9-01        | Implemented |
| M9-03 | [`AR-03 Writing工具与展示拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#4-ar-03-writing工具与展示拆分)                    | M9-01、M9-02        | Planned     |
| M9-04 | [`AR-04 Writing章节会话状态机`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#5-ar-04-writing章节会话状态机)                    | M9-03               | Planned     |
| M9-05 | [`AR-05 Canon拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#6-ar-05-canon拆分)                                            | M9-01               | Planned     |
| M9-06 | [`AR-06 Planning拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#7-ar-06-planning拆分)                                      | M9-01、M9-02        | Planned     |
| M9-07 | [`AR-07 AppShell拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#8-ar-07-appshell拆分)                                      | M9-04、M9-05、M9-06 | Planned     |
| M9-08 | [`AR-08 Contracts拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#9-ar-08-contracts拆分)                                    | M9-01               | Planned     |
| M9-09 | [`AR-09 Preload拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#10-ar-09-preload拆分)                                       | M9-08               | Planned     |
| M9-10 | [`AR-10 Main IPC拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#11-ar-10-main-ipc拆分)                                     | M9-08、M9-09        | Planned     |
| M9-11 | [`AR-11 State Proposal与Generation拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#12-ar-11-state-proposal与generation拆分) | M9-01               | Planned     |
| M9-12 | [`AR-12 Project Workspace拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#13-ar-12-project-workspace拆分)                   | M9-01               | Planned     |
| M9-13 | [`AR-13 Recovery与工具域拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#14-ar-13-recovery与工具域拆分)                     | M9-12               | Planned     |
| M9-14 | [`AR-14 Legacy、CSS与最终结构收敛`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#15-ar-14-legacycss与最终结构收敛)             | M9-02—M9-13         | Planned     |

## 3. 被吸收的需求来源

以下文件不参与机器任务解析和活动任务切换；完整要求由对应整体任务承接。

| 原ID  | 来源文件                                                                               | 原阶段 | 独立执行状态        | 统一归属 |
| ----- | -------------------------------------------------------------------------------------- | ------ | ------------------- | -------- |
| M4-05 | [`GenerationRun、流式运行与模型支持档案`](M4/M4-05_GENERATION_RUNTIME_EVAL.md)         | M4     | Removed（absorbed） | M4-04    |
| M5-00 | [`作者工作流与产品体验收口`](M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md)           | M5     | Removed（absorbed） | M4-04    |
| M5-01 | [`T0多候选骨架`](M5/M5-01_T0_SKELETON.md)                                              | M5     | Removed（absorbed） | M4-04    |
| M5-02 | [`T1章节扩写`](M5/M5-02_T1_CHAPTER_GENERATION.md)                                      | M5     | Removed（absorbed） | M4-04    |
| M5-03 | [`快速改写与结构性改写`](M5/M5-03_REWRITE_WORKFLOWS.md)                                | M5     | Removed（absorbed） | M4-04    |
| M5-04 | [`多候选融合与部分结果恢复`](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md)                      | M5     | Removed（absorbed） | M4-04    |
| M5-05 | [`候选审阅、采用与冲突工作台`](M5/M5-05_CANDIDATE_REVIEW_APPLY.md)                     | M5     | Removed（absorbed） | M4-04    |
| M5-06 | [`真实状态提取与StateProposal接入`](M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md) | M5     | Removed（absorbed） | M4-04    |
| M6-01 | [`确定性/统计校验与修订待办`](M6/M6-01_RULE_STATUS_VALIDATION_TODOS.md)                | M6     | Removed（absorbed） | M4-04    |
| M6-02 | [`AI语义与人物弧光一致性校验`](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md)                 | M6     | Removed（absorbed） | M4-04    |
| M6-03 | [`全项目搜索与安全批量替换`](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md)                  | M6     | Removed（absorbed） | M4-04    |
| M6-04 | [`网文章奏与连载指标`](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md)                        | M6     | Removed（absorbed） | M4-04    |
| M6-05 | [`DOCX安全导入与多格式导出`](M6/M6-05_DOCX_TRANSFER.md)                                | M6     | Removed（absorbed） | M4-04    |
| M6-06 | [`三轨备份、恢复中心与空间清理`](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md)              | M6     | Removed（absorbed） | M4-04    |
| M7-01 | [`新手/专业模式、向导与三条创作路径`](M7/M7-01_ONBOARDING_MODES_PATHS.md)              | M7     | Removed（absorbed） | M8-02    |
| M7-02 | [`统一工作台、沉浸视图与交互状态`](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md)         | M7     | Removed（absorbed） | M8-02    |
| M7-03 | [`双视觉主题、无障碍与响应式验收`](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md)        | M7     | Removed（absorbed） | M8-02    |
| M8-01 | [`安全、数据、Migration与隐私硬化`](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md)       | M8     | Removed（absorbed） | M8-02    |
| M8-03 | [`跨平台构建、P0追踪与发布关闭`](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md)        | M8     | Removed（absorbed） | M8-02    |

## 4. 阶段门

1. M0—M8-09与M9-01保持Verified；M9-00和M9-02完成后方可激活依赖它们的工作包。
2. 每个PR绑定一个主任务并按自身`allowedPaths`验证；不同任务可以同时开放PR。
3. main写入保持串行：一个PR合并并完成Main Verification后，才允许下一个PR写入main。
4. M9只做保持行为的职责拆分，不改变本地优先、AI作者裁决、数据库Schema、IPC协议或正式错误码。
5. M9不得改写M8-09及更早任务的历史Evidence。
6. AR-04、AR-10、AR-12和AR-13必须保存独立回退说明；AR-14不得承接前序未完成拆分。
7. 任一releaseBlocking任务未Verified时，发布资格必须被拒绝。

## 5. 状态原则

- 已Verified任务卡、历史Migration和历史验证记录保持冻结。
- Implemented表示工程实现、分支验证和实现Evidence已完成，但尚未完成主分支最终验证。
- 多任务可以并行开发，依赖和main写入顺序仍必须满足。
- 验证记录必须绑定真实受检提交，不得沿用旧提交或把执行中写成成功。
- main只接受通过Ready模式永久门禁和合并后验证的受控合并请求。
