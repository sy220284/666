# M4-04 WorldForge V1核心功能整体实施

> 状态：In Progress  
> 里程碑：M4—M6 V1核心功能交付  
> 优先级：P0  
> 最终任务：否  
> 正式分支：`work/m4-04-v1-integrated-delivery`

## 目标

在M0—M3与M4-01—M4-03已完成基础上，完成V1核心功能的统一实现与阶段验收：作者继续写作、GenerationRun、T0/T1、改写与融合、Candidate安全采用、状态提取与校验、搜索替换、写作统计、DOCX导入导出和三轨备份恢复。

M4-04只承接原M4-05、M5-00—M5-06与M6-01—M6-06。完整体验、主题与无障碍、真实显示矩阵、安全与性能终验、真实Provider Eval、跨平台构建和发布关闭统一延期到独立任务`M8-02`。

## 权威边界

```text
M4-04
├─ C0：整体规划与基线审计
├─ C1：作者工作流与继续写作
├─ C2：GenerationRun与生产Prompt
├─ C3：T0/T1与结构化Candidate
├─ C4：改写、融合、审阅与采用
├─ C5：状态提取、Validation与Todo/Comment
├─ C6：搜索、替换、统计与节奏
└─ C7：DOCX与三轨备份恢复

M8-02
└─ C8：完整体验、硬化、真实平台验收与发布关闭
```

C8不属于M4-04的Ready、Implemented或Evidence关闭范围。M4-04完成后进入Implementation Hold，`M8-02`保持Planned，待作者后续明确启动。

## 被吸收需求来源

- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`
- `docs/tasks/M5/M5-02_T1_CHAPTER_GENERATION.md`
- `docs/tasks/M5/M5-03_REWRITE_WORKFLOWS.md`
- `docs/tasks/M5/M5-04_CANDIDATE_MERGE_PARTIAL.md`
- `docs/tasks/M5/M5-05_CANDIDATE_REVIEW_APPLY.md`
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`
- `docs/tasks/M6/M6-01_RULE_STATS_VALIDATION_TODOS.md`
- `docs/tasks/M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md`
- `docs/tasks/M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md`
- `docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md`
- `docs/tasks/M6/M6-05_DOCX_TRANSFER.md`
- `docs/tasks/M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md`

原M7-01—M7-03、M8-01和M8-03改由`M8-02`吸收。

## 必须复用

- Prompt Registry、Cleaner、Parser、Provider适配器与TaskProtocol。
- Draft Patch、Revision、Hash、LockGuard、Candidate、Diff、ApplyRecord与Checkpoint。
- 规划、SceneBeat、Entity、Canon、EntityState、KnowledgeState、Foreshadowing、CharacterArc与StateProposal。
- FTS、ConstraintPackage、CoordinatedImportExportService、ImportPlan和RecoveryService。
- React Renderer、Tiptap、Zustand、Appearance与Theme状态真源。

禁止建立第二套Prompt、AI任务协议、Candidate采用、导入、恢复、模式或主题状态系统。

## 实施范围

### C0 整体规划与审计

完成需求—用户路径—代码—测试—P0映射，冻结共享合同、Migration、IPC、错误码、风险和回滚矩阵。

### C1 作者工作流

完成项目继续写作、章节与Draft定位、光标与滚动恢复、工作台面板恢复、目录与侧栏体验；同项目Continuation写入串行，最新面板最终胜出，旧请求、旧失败重试与迟到结果不得回退权威状态。

### C2 GenerationRun与Prompt

完成生产Prompt、GenerationRun持久化、Provider/Model/usage/error追溯、取消与partial裁决、类型化结果引用和独立Generation IPC。

### C3 T0/T1与Candidate

完成结构化Skeleton Candidate、T1三种互斥输入、Prose Candidate、来源追溯、stale确认与Skeleton正文隔离。

### C4 改写、融合与采用

完成快速改写、结构改写、Beat/Segment融合、Candidate预览、Diff、冲突、采用、撤销和恢复，AI结果不得绕过Candidate直接写Draft。

### C5 状态与校验

完成StateProposalBatch、ValidationBatch、ValidationIssue、StoryTodo、StoryComment、复合锚点和Schema 28历史脏数据升级保护。

### C6 搜索与统计

完成Draft/Version/Entity搜索、安全批量替换、七类`mutationOrigin`、人工写作统计、节奏与连载建议。

### C7 导入导出与恢复

完成DOCX安全导入、TXT/Markdown/DOCX不可变Version导出、日常/重大/命名三轨备份、保护、配额、清理和恢复新副本。

## 纵向闭环

每项能力按实际影响完成：

```text
Contracts
→ Domain（适用）
→ Migration / Repository（适用）
→ Core
→ Electron Main
→ Preload
→ Renderer
→ Unit / Integration / Migration / Security / Electron E2E
→ 文档、追踪与Evidence
```

无影响层必须在阶段记录中明确。禁止单层接口、单层UI、悬空Migration、半成品入口或伪造成功。

## 主要影响范围

- `apps/`
- `packages/`
- `migrations/`
- `evals/`
- `tests/`
- `scripts/`
- `.github/workflows/`
- `.github/governance/`
- `docs/`
- 根目录工程与发布文件

## 测试与Evidence

M4-04阶段验收至少包括：

- Workspace与Boundary
- Prettier、ESLint、TypeScript
- Unit、Integration、Migration、Coverage
- Security、Performance
- Build、Package Smoke
- Electron E2E
- Evidence、PR Policy、Task Governance

统一证据目录：`docs/test-evidence/M4-04/`。

Evidence必须绑定真实产品Head，记录命令、运行编号、风险、Migration、IPC、测试和最终结论。C8相关真实平台、真实Provider和发布结论不得提前写入M4-04成功范围。

## 完成条件

- C0—C7及C1并发硬化均形成真实纵向闭环。
- 所有新增Schema、Migration、IPC、Renderer入口与测试一致。
- 继续写作快速回切最终状态由数据库与跨重启Electron E2E验证。
- C5历史非法复合锚点升级失败时保持旧Schema、原数据和只读恢复能力。
- 无AI时项目创建、写作、保存、Version、导出与恢复保持可用。
- M4-04产品Head的完整PR门禁全部成功。
- TASK_INDEX将M4-04标记为Implemented，`ACTIVE_TASK`进入Implementation Hold。
- `M8-02`保持Planned且未自动激活。

## C8延期声明

以下范围不作为M4-04阻断，全部进入`M8-02`：

- 首次使用向导、统一工作台最终体验和上下文帮助。
- Theme A/B、浅/深/护眼/高对比、减少动态、键盘、焦点和读屏终验。
- 1280×800、2K、21:9、混合DPI与真实多屏。
- 完整安全、性能、Electron E2E、AI Eval和真实数据规模报告。
- Windows、macOS、Linux安装、升级、卸载、原生模块与安全降级。
- P0总验收、发布判断和最终Verified关闭。

延期不等于删除。`M8-02`启动后必须重新读取M7-01—M8-03全部来源并完成最终发布Evidence。