# WorldForge 任务索引

> 状态：Active  
> 基线：WorldForge V6.5  
> 独立任务体系：M0—M3、M4-01—M4-04、M8-02、M8-04—M8-09、M9-00—M9-03及M10-01—M10-16，共61张独立任务卡。  
> M9-04—M9-14为被M9-03吸收的冻结工作包别名，不参与独立任务解析。

## 1. 状态读取规则

本索引记录任务的静态声明状态。最终有效状态必须结合Runtime与各任务来源合并提交的GitHub Commit Status计算：

```text
Runtime IMPLEMENTED
+ 来源PR对应主线提交上的task-verification/<TASK-ID>=success
→ 有效VERIFIED
```

当前main的`main-verification`只证明当前主线提交可用，不能替代历史任务自己的任务Context。依赖、发布、Evidence全量扫描和下一任务启动统一使用`.github/governance/effective-task-status.mjs`。

固定入口：

1. [`TASK_AUTHORIZATION.json`](TASK_AUTHORIZATION.json)：分支、PR和main写入授权。
2. [`runtime/`](runtime/)：静态状态、边界、验证命令和任务Context绑定。
3. [`../PROJECT_EXECUTION_ENTRY.md`](../PROJECT_EXECUTION_ENTRY.md)：动态状态解析与闭环条件。
4. 任务卡：范围、验收和回退依据。

## 2. 独立任务

### M0 工程、安全与运行底座

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [`Monorepo、质量工具与CI`](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Verified |
| M0-02 | [`Electron安全壳与Core生命周期`](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Verified |
| M0-03 | [`SQLite、Migration与单写队列`](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | M0-01 | Verified |
| M0-04 | [`IPC、错误码、事件与任务协议`](M0/M0-04_IPC_EVENT_TASK_PROTOCOL.md) | M0-02、M0-03 | Verified |
| M0-05 | [`测试基建、Fixture与故障注入`](M0/M0-05_TESTKIT_FAULT_INJECTION.md) | M0-01、M0-02、M0-03、M0-04 | Verified |
| M0-06 | [`显示、DPI与窗口恢复Spike`](M0/M0-06_DISPLAY_WINDOW_SPIKE.md) | M0-02、M0-03、M0-05 | Verified |
| M0-07 | [`AI输出协议与中文Diff Spike`](M0/M0-07_AI_DIFF_SPIKE.md) | M0-03、M0-04、M0-05 | Verified |

### M1 基础写作MVP

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M1-01 | [`app.sqlite、应用设置与最近项目`](M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md) | 无 | Verified |
| M1-02 | [`项目工作空间、路径边界与只读打开`](M1/M1-02_PROJECT_WORKSPACE_PATHS.md) | M1-01 | Verified |
| M1-03 | [`卷与章节基础生命周期`](M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md) | M1-02 | Verified |
| M1-04 | [`Draft、Tiptap与中文输入`](M1/M1-04_DRAFT_EDITOR_IME.md) | M1-03 | Verified |
| M1-05 | [`Block Patch、内容Hash与Revision`](M1/M1-05_BLOCK_PATCH_REVISION.md) | M1-04 | Verified |
| M1-06 | [`自动保存、字数与当前章查找`](M1/M1-06_AUTOSAVE_STATS_FIND.md) | M1-05 | Verified |
| M1-07 | [`手动Version、定稿与历史恢复`](M1/M1-07_MANUAL_VERSION_FINALIZE.md) | M1-06 | Verified |
| M1-08 | [`基础恢复点、完整性检查与只读恢复`](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02、M0-03 | Verified |
| M1-09 | [`TXT与Markdown基础导入导出`](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md) | M1-07、M1-08 | Verified |

### M2 编辑安全与版本核心

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M2-01 | [`锁定块与Core LockGuard`](M2/M2-01_LOCK_GUARD.md) | M1-05 | Verified |
| M2-02 | [`Candidate与完整Version模型`](M2/M2-02_CANDIDATE_VERSION_MODEL.md) | M1-07、M2-01 | Verified |
| M2-03 | [`Diff、冲突、采用与持久化撤销`](M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md) | M2-02 | Verified |
| M2-04 | [`回收站、拆章、并章与结构恢复`](M2/M2-04_TRASH_STRUCTURE_RECOVERY.md) | M2-03、M1-08 | Verified |

### M3 规划、设定与连续性

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

### M4 AI基础与V1核心功能

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M4-01 | [`FTS5公共索引、队列与项目词典`](M4/M4-01_FTS_INDEX_DICTIONARY.md) | M3 | Verified |
| M4-02 | [`P0—P4约束包与裁剪追溯`](M4/M4-02_CONSTRAINT_PACKAGE.md) | M4-01、M3-06 | Verified |
| M4-03 | [`Provider、凭据与连接测试`](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0-02、M0-04、M0-05 | Verified |
| M4-04 | [`V1核心功能整体实施`](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-01、M4-02、M4-03、M0-07 | Verified |

### M8 交付与体验

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M8-02 | [`完整体验、硬化与自用交付关闭`](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | M4-04 | Verified |
| M8-04 | [`作者体验与开发语言统一改造`](M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md) | M8-02 | Verified |
| M8-05 | [`运行时硬化与文档统一同步`](M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md) | M8-04 | Verified |
| M8-06 | [`发布资格与任务治理硬化`](M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md) | M8-05 | Verified |
| M8-07 | [`中文作者体验治理闭环与产品发布验收硬化`](M8/M8-07_CHINESE_EXPERIENCE_GOVERNANCE.md) | M8-06 | Verified |
| M8-08 | [`V1.0最终质量治理与封版闭环`](M8/M8-08_V1_FINAL_GOVERNANCE_CLOSURE.md) | 开发：M8-06；封版：M8-07 | Verified |
| M8-09 | [`V1.0稳定性与生命周期治理`](M8/M8-09_V1_STABILITY_HARDENING.md) | M8-08 | Verified |

### M9 V1.1架构拆分治理

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M9-00 | [`M9激活治理与权威文档同步`](M9/M9-00_ACTIVATION_GOVERNANCE.md) | M8-09 | Verified |
| M9-01 | [`重构安全网`](M9/M9-01_REFACTOR_SAFETY_NET.md) | M8-09 | Verified |
| M9-02 | [`Shared Structure拆分`](M9/M9-02_SHARED_STRUCTURE.md) | M9-00、M9-01 | Verified |
| M9-03 | [`V1.1剩余架构拆分统一执行`](M9/M9-03_WRITING_TOOLS_DISPLAY.md) | M9-01、M9-02 | Verified |
| `M9-04` | [`AR-04 Writing章节会话状态机`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#5-ar-04-writing章节会话状态机) | M9-03内部AR-03 | Removed（absorbed by M9-03） |
| `M9-05` | [`AR-05 Canon拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#6-ar-05-canon拆分) | M9-03内部基线 | Removed（absorbed by M9-03） |
| `M9-06` | [`AR-06 Planning拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#7-ar-06-planning拆分) | M9-03内部AR-02 | Removed（absorbed by M9-03） |
| `M9-07` | [`AR-07 AppShell拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#8-ar-07-appshell拆分) | M9-03内部AR-04—06 | Removed（absorbed by M9-03） |
| `M9-08` | [`AR-08 Contracts拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#9-ar-08-contracts拆分) | M9-03内部基线 | Removed（absorbed by M9-03） |
| `M9-09` | [`AR-09 Preload拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#10-ar-09-preload拆分) | M9-03内部AR-08 | Removed（absorbed by M9-03） |
| `M9-10` | [`AR-10 Main IPC拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#11-ar-10-main-ipc拆分) | M9-03内部AR-08、09 | Removed（absorbed by M9-03） |
| `M9-11` | [`AR-11 State Proposal与Generation拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#12-ar-11-state-proposal与generation拆分) | M9-03内部基线 | Removed（absorbed by M9-03） |
| `M9-12` | [`AR-12 Project Workspace拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#13-ar-12-project-workspace拆分) | M9-03内部基线 | Removed（absorbed by M9-03） |
| `M9-13` | [`AR-13 Recovery与工具域拆分`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#14-ar-13-recovery与工具域拆分) | M9-03内部AR-12 | Removed（absorbed by M9-03） |
| `M9-14` | [`AR-14 Legacy、CSS与最终结构收敛`](M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md#15-ar-14-legacycss与最终结构收敛) | M9-03内部AR-03—13 | Removed（absorbed by M9-03） |

### M10 稳定性与治理续作

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M10-01 | [`异步生命周期与竞态硬化`](M10/M10-01_ASYNC_LIFECYCLE_HARDENING.md) | M9-03 | Verified |
| M10-02 | [`全量代码测试与深度审计`](M10/M10-02_FULL_CODE_AUDIT.md) | M10-01 | Verified |
| M10-03 | [`IPC与协议维护治理`](M10/M10-03_IPC_PROTOCOL_MAINTENANCE.md) | M10-02 | Verified |
| M10-04 | [`兼容面收敛治理`](M10/M10-04_COMPATIBILITY_CONVERGENCE.md) | M10-03 | Implemented |
| M10-05 | [`治理闭环一致性修复`](M10/M10-05_GOVERNANCE_CLOSURE_CONSISTENCY.md) | M10-04 | Implemented |
| M10-06 | [`历史验证状态继承`](M10/M10-06_HISTORICAL_VERIFICATION_INHERITANCE.md) | M10-05 | Implemented |
| M10-07 | [`正文变更与恢复安全收口`](M10/M10-07_CONTENT_MUTATION_RECOVERY_HARDENING.md) | M10-06 | Implemented |
| M10-08 | [`全量代码规范与结构原则治理`](M10/M10-08_CODE_QUALITY_GOVERNANCE.md) | M10-07 | Implemented |
| M10-09 | [`Evidence收口与自动合并竞态治理`](M10/M10-09_EVIDENCE_CLOSURE_RACE.md) | M10-08 | Implemented |
| M10-10 | [`当前工作空间工具链权威文档治理`](M10/M10-10_CURRENT_WORKSPACE_TOOLCHAIN_AUTHORITY.md) | M10-09 | Implemented |
| M10-11 | [`运行时、恢复与异步安全硬化`](M10/M10-11_RUNTIME_DATA_SAFETY_HARDENING.md) | M10-10 | Implemented |
| M10-12 | [`命令身份与生成生命周期一致性治理`](M10/M10-12_COMMAND_IDENTITY_GENERATION_LIFECYCLE.md) | M10-11 | Implemented |
| M10-13 | [`1.5前置边界重构与根因治理`](M10/M10-13_V1_5_PREFLIGHT_BOUNDARY_REFACTOR.md) | M10-12 | Implemented |
| M10-14 | [`Recovery、Bridge与边界审计收口`](M10/M10-14_RECOVERY_BRIDGE_POST_AUDIT_HARDENING.md) | M10-13 | Implemented |
| M10-15 | [`AI权威上下文与生成前置一致性收口`](M10/M10-15_AI_AUTHORITY_CONTEXT_GENERATION_PREFLIGHT.md) | M10-14 | Implemented |
| M10-16 | [`语义新鲜度与派生失效一致性收口`](M10/M10-16_SEMANTIC_FRESHNESS_DERIVED_INVALIDATION.md) | M10-15 | In Progress |

## 3. 被吸收的需求来源

以下文件不参与独立任务解析；要求由统一归属任务承接。

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
| M6-01 | [`确定性/统计校验与修订待办`](M6/M6-01_RULE_STATUS_VALIDATION_TODOS.md) | M6 | Removed（absorbed） | M4-04 |
| M6-02 | [`AI语义与人物弧光一致性校验`](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md) | M6 | Removed（absorbed） | M4-04 |
| M6-03 | [`全项目搜索与安全批量替换`](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md) | M6 | Removed（absorbed） | M4-04 |
| M6-04 | [`网文章奏与连载指标`](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md) | M6 | Removed（absorbed） | M4-04 |
| M6-05 | [`DOCX安全导入与多格式导出`](M6/M6-05_DOCX_TRANSFER.md) | M6 | Removed（absorbed） | M4-04 |
| M6-06 | [`三轨备份、恢复中心与空间清理`](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md) | M6 | Removed（absorbed） | M4-04 |
| M7-01 | [`新手/专业模式、向导与三条创作路径`](M7/M7-01_ONBOARDING_MODES_PATHS.md) | M7 | Removed（absorbed） | M8-02 |
| M7-02 | [`统一工作台、沉浸视图与交互状态`](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md) | M7 | Removed（absorbed） | M8-02 |
| M7-03 | [`双视觉主题、无障碍与响应式验收`](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md) | M7 | Removed（absorbed） | M8-02 |
| M8-01 | [`安全、数据、Migration与隐私硬化`](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | M8 | Removed（absorbed） | M8-02 |
| M8-03 | [`跨平台构建、P0追踪与发布关闭`](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | M8 | Removed（absorbed） | M8-02 |

## 4. 阶段门

1. 新建和活动Runtime必须使用Schema 2；历史Schema 1 Runtime只读冻结。
2. 一个`work → main` PR完成永久门禁、合并、Main Verification和Work Synchronization后，才能启动下一任务。
3. 已Verified历史任务、Migration和Evidence保持冻结。
4. 任一releaseBlocking任务未有效Verified，或当前main缺少`main-verification`，发布资格必须拒绝。
5. Ready Evidence manifest绑定当前任务最新实现提交；该提交之后只允许当前任务卡、Runtime、`TASK_INDEX.md`和当前任务Evidence收口，Evidence CI Check绑定精确PR Head。
6. 分支长期只允许`main`与`work`，不存在`release/*`例外。
7. 历史Implemented任务必须从其来源PR对应主线提交继承任务Context，禁止借用当前main上的其他任务Context。
8. 文件行数只作为观察指标；结构门禁依据循环依赖、跨层方向、Feature边界和状态所有权，禁止机械拆分完整功能。
