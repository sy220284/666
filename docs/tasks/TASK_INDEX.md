# WorldForge V1.0 任务索引

> 状态：Frozen  
> 基线：WorldForge V6.5  
> 任务体系：M0—M8九阶段，共52张独立任务卡。  
> 原则：同一时间一个活动任务；一任务一文件；每任务独立原子提交；完成必须有证据。

## 1. 唯一执行入口

1. [`ACTIVE_TASK.json`](ACTIVE_TASK.json)：机器可读的唯一活动任务状态与授权。
2. [`ACTIVE_TASK.md`](ACTIVE_TASK.md)：由JSON生成的人类可读镜像。
3. ACTIVE_TASK指向的独立任务卡。
4. [`../PROJECT_EXECUTION_ENTRY.md`](../PROJECT_EXECUTION_ENTRY.md)：专项文档路由。

任务状态：

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

## 2. 阶段总览

| 阶段 | 定位                 | 任务数 | 阶段退出结果                                                                  |
| ---- | -------------------- | -----: | ----------------------------------------------------------------------------- |
| M0   | 工程、安全与运行底座 |      7 | 应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。 |
| M1   | 基础写作MVP          |      9 | 交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。              |
| M2   | 编辑安全与版本核心   |      4 | 所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。      |
| M3   | 规划、设定与连续性   |     10 | 建立权威连续性数据，并在M4前完成Renderer React架构校正与旧入口退役。           |
| M4   | 检索与AI基础设施     |      5 | 建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。          |
| M5   | AI生成与候选审阅     |      5 | 完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。                 |
| M6   | 校验、搜索与交付     |      6 | 补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。                          |
| M7   | 完整UI与体验整合     |      3 | 统一工作台、新手/专业模式、主题、无障碍和目标显示环境。                       |
| M8   | 发布硬化与验收       |      3 | 完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。                     |

```text
M0 安全可运行
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划设定与连续性
→ M4 检索与AI基础设施
→ M5 AI生成与候选审阅
→ M6 校验搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

M1是明确的基础产品门：没有AI时也必须能够创建项目、建卷章、写作、自动保存、查看字数、查找、保存历史版本、导入导出和恢复。

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

里程碑摘要：[`M0_TASKS.md`](M0_TASKS.md)。

## M1 基础写作MVP

| ID    | 任务卡                                                                         | 依赖         | 状态     |
| ----- | ------------------------------------------------------------------------------ | ------------ | -------- |
| M1-01 | [`app.sqlite、应用设置与最近项目`](M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md)   | M0           | Verified |
| M1-02 | [`项目工作空间、路径边界与只读打开`](M1/M1-02_PROJECT_WORKSPACE_PATHS.md)      | M1-01        | Verified |
| M1-03 | [`卷与章节基础生命周期`](M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md)                 | M1-02        | Verified |
| M1-04 | [`Draft、Tiptap与中文输入`](M1/M1-04_DRAFT_EDITOR_IME.md)                      | M1-03        | Verified |
| M1-05 | [`Block Patch、内容Hash与Revision`](M1/M1-05_BLOCK_PATCH_REVISION.md)          | M1-04        | Verified |
| M1-06 | [`自动保存、字数与当前章查找`](M1/M1-06_AUTOSAVE_STATS_FIND.md)                | M1-05        | Verified |
| M1-07 | [`手动Version、定稿与历史恢复`](M1/M1-07_MANUAL_VERSION_FINALIZE.md)           | M1-06        | Verified |
| M1-08 | [`基础恢复点、完整性检查与只读恢复`](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02、M0-03 | Verified |
| M1-09 | [`TXT与Markdown基础导入导出`](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md)              | M1-07、M1-08 | Verified |

里程碑摘要：[`M1_TASKS.md`](M1_TASKS.md)。

## M2 编辑安全与版本核心

| ID    | 任务卡                                                                 | 依赖         | 状态     |
| ----- | ---------------------------------------------------------------------- | ------------ | -------- |
| M2-01 | [`锁定块与Core LockGuard`](M2/M2-01_LOCK_GUARD.md)                     | M1-05        | Verified |
| M2-02 | [`Candidate与完整Version模型`](M2/M2-02_CANDIDATE_VERSION_MODEL.md)    | M1-07、M2-01 | Verified |
| M2-03 | [`Diff、冲突、采用与持久化撤销`](M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md) | M2-02        | Verified |
| M2-04 | [`回收站、拆章、并章与结构恢复`](M2/M2-04_TRASH_STRUCTURE_RECOVERY.md) | M2-03、M1-08 | Verified |

里程碑摘要：[`M2_TASKS.md`](M2_TASKS.md)。

## M3 规划、设定与连续性

| ID    | 任务卡                                                                    | 依赖                       | 状态        |
| ----- | ------------------------------------------------------------------------- | -------------------------- | ----------- |
| M3-01 | [`作品任务书与大纲树`](M3/M3-01_PROJECT_BRIEF_OUTLINE.md)                 | M2                         | Implemented |
| M3-02 | [`SceneBeat、场景关联与跨章移动`](M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md)   | M3-01、M2-04               | Verified    |
| M3-03 | [`通用实体与静态Canon`](M3/M3-03_ENTITY_CANON.md)                         | M3-01                      | Implemented |
| M3-04 | [`动态状态、时间线与知情信息`](M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md)      | M3-02、M3-03               | Verified    |
| M3-05 | [`伏笔生命周期与人物弧光`](M3/M3-05_FORESHADOWING_CHARACTER_ARC.md)       | M3-04                      | Implemented |
| M3-06 | [`状态提案、定稿、尾快照与失效传播`](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | In Progress |
| M3-07 | [`Renderer React基础、Bridge适配与状态边界`](M3/M3-07_RENDERER_REACT_FOUNDATION.md) | M3-06 | Planned |
| M3-08 | [`Renderer壳层、首页、项目与设置迁移`](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md) | M3-07 | Planned |
| M3-09 | [`Renderer规划、设定、结构与数据工具迁移`](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md) | M3-08 | Planned |
| M3-10 | [`Renderer写作、Version、Candidate迁移与旧入口退役`](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09 | Planned |

里程碑摘要：[`M3_TASKS.md`](M3_TASKS.md)。

## M4 检索与AI基础设施

| ID    | 任务卡                                                                         | 依赖                    | 状态    |
| ----- | ------------------------------------------------------------------------------ | ----------------------- | ------- |
| M4-01 | [`FTS5公共索引、队列与项目词典`](M4/M4-01_FTS_INDEX_DICTIONARY.md)             | M3                      | Planned |
| M4-02 | [`P0—P4约束包与裁剪追溯`](M4/M4-02_CONSTRAINT_PACKAGE.md)                      | M4-01、M3-06            | Planned |
| M4-03 | [`Provider、凭据与连接测试`](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md)       | M3、M0-02、M0-04、M0-05 | Planned |
| M4-04 | [`Prompt Registry、输出Schema与Cleaner`](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)   | M4-02、M4-03            | Planned |
| M4-05 | [`GenerationRun、流式运行与模型支持档案`](M4/M4-05_GENERATION_RUNTIME_EVAL.md) | M4-04、M0-07            | Planned |

里程碑摘要：[`M4_TASKS.md`](M4_TASKS.md)。

## M5 AI生成与候选审阅

| ID    | 任务卡                                                             | 依赖                               | 状态    |
| ----- | ------------------------------------------------------------------ | ---------------------------------- | ------- |
| M5-01 | [`T0多候选骨架`](M5/M5-01_T0_SKELETON.md)                          | M4                                 | Planned |
| M5-02 | [`T1章节扩写`](M5/M5-02_T1_CHAPTER_GENERATION.md)                  | M5-01                              | Planned |
| M5-03 | [`快速改写与结构性改写`](M5/M5-03_REWRITE_WORKFLOWS.md)            | M5-02、M2-03                       | Planned |
| M5-04 | [`多候选融合与部分结果恢复`](M5/M5-04_CANDIDATE_MERGE_PARTIAL.md)  | M5-02、M5-03                       | Planned |
| M5-05 | [`候选审阅、采用与冲突工作台`](M5/M5-05_CANDIDATE_REVIEW_APPLY.md) | M5-01、M5-02、M5-03、M5-04、M2-03 | Planned |

里程碑摘要：[`M5_TASKS.md`](M5_TASKS.md)。

## M6 校验、搜索与交付

| ID    | 任务卡                                                                    | 依赖                       | 状态    |
| ----- | ------------------------------------------------------------------------- | -------------------------- | ------- |
| M6-01 | [`确定性/统计校验与修订待办`](M6/M6-01_RULE_STATS_VALIDATION_TODOS.md)    | M5、M3                     | Planned |
| M6-02 | [`AI语义与人物弧光一致性校验`](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md)    | M6-01、M4-05、M3-05        | Planned |
| M6-03 | [`全项目搜索与安全批量替换`](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md)     | M4-01、M2-01、M1-08        | Planned |
| M6-04 | [`网文节奏与连载指标`](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md)           | M3-02、M6-01、M6-02        | Planned |
| M6-05 | [`DOCX安全导入与多格式导出`](M6/M6-05_DOCX_TRANSFER.md)                   | M1-09、M1-08               | Planned |
| M6-06 | [`三轨备份、恢复中心与空间清理`](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md) | M1-08、M2-04、M6-03、M6-05 | Planned |

里程碑摘要：[`M6_TASKS.md`](M6_TASKS.md)。

## M7 完整UI与体验整合

| ID    | 任务卡                                                                          | 依赖         | 状态    |
| ----- | ------------------------------------------------------------------------------- | ------------ | ------- |
| M7-01 | [`新手/专业模式、向导与三条创作路径`](M7/M7-01_ONBOARDING_MODES_PATHS.md)       | M1—M6        | Planned |
| M7-02 | [`统一工作台、沉浸视图与交互状态`](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md)  | M7-01        | Planned |
| M7-03 | [`双视觉主题、无障碍与响应式验收`](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md) | M7-02、M0-06 | Planned |

里程碑摘要：[`M7_TASKS.md`](M7_TASKS.md)。

## M8 发布硬化与验收

| ID    | 任务卡                                                                           | 依赖         | 状态    |
| ----- | -------------------------------------------------------------------------------- | ------------ | ------- |
| M8-01 | [`安全、数据、Migration与隐私硬化`](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | M7、M6       | Planned |
| M8-02 | [`性能、E2E、显示与AI Eval验收`](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md)            | M8-01、M7-03 | Planned |
| M8-03 | [`跨平台构建、P0追踪与发布关闭`](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md)  | M8-01、M8-02 | Planned |

里程碑摘要：[`M8_TASKS.md`](M8_TASKS.md)。

## 3. 阶段门规则

1. 不允许跳过M0直接开发业务页面。
2. M1未Verified前，不得把AI、人物弧光、节奏检测或完整主题当作主线进度。
3. 后一阶段不得使用尚未由前一阶段建立的表、命令、模型或恢复能力。
4. 每个用户功能任务必须包含最小可操作UI；M3-07—M3-10先完成Renderer正式架构迁移，M7只做统一整合，不负责基础框架重写或第一次接通业务。
5. 恢复点、FTS、Candidate、Prompt等公共能力分为基础底座和上层使用，禁止重复实现。
6. 同一阶段内只有依赖满足的任务可并行；不得并行修改同一权威Schema、Migration序列、IPC命令或核心模型。
7. 阶段退出必须有真实业务场景证据，不能只以文件、接口或Mock数量判断。

## 4. 执行规则

1. 任务激活时先更新`ACTIVE_TASK.json`、同步`ACTIVE_TASK.md`并更新本索引状态。
2. Codex只能修改活动任务允许路径；范围变化先改活动任务文件。
3. 默认一任务一分支；作者预授权的连续主线模式在`main`上以一任务一个原子提交或提交组隔离。
4. `Implemented`表示真实接通；自动化、人工验收和证据完成后才标记`Verified`。
5. 连续主线模式在任务Verified后自动激活下一张依赖已满足的任务；其他模式恢复为无活动任务。
6. V1.5任务不进入本索引，满足启动门后单独建立Epic和任务目录。
