# WorldForge 文档总索引

> 基线：WorldForge V6.5  
> 适用：V1.0核心写作闭环；V1.5超长篇增强  
> 原则：设计真源集中、任务一文件、工程契约独立、需求可追踪、验收有证据。

## 1. 开始工作只走这条路径

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

- [`../AGENTS.md`](../AGENTS.md)：Codex仓库级强制规则。
- [`../agent.md`](../agent.md)：人工和通用代理快速入口。
- [`PROJECT_EXECUTION_ENTRY.md`](PROJECT_EXECUTION_ENTRY.md)：根据任务类型查询文档的统一路由。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：当前唯一允许执行的开发任务。
- [`process/CODEX_EXECUTION_PLAYBOOK.md`](process/CODEX_EXECUTION_PLAYBOOK.md)：任务从启动到关闭的闭环操作手册。

## 2. 权威层级

```text
作者最新明确指令
> ACTIVE_TASK已批准范围与验收
> product/WORLDFORGE_V6.5_FULL_SPEC.md
> 专项冻结规格、ADR、Schema、IPC、UI、安全和P0验收
> decisions/IMPLEMENTATION_DECISIONS.md
> AGENTS.md、闭环执行手册和长篇开发指南
> 现有实现
```

发现冲突时停止相关修改并报告，不自行选择一份覆盖另一份。

## 3. 产品与范围

- [`product/WORLDFORGE_V6.5_FULL_SPEC.md`](product/WORLDFORGE_V6.5_FULL_SPEC.md)：Codex可检索的V6.5最高权威完整设计规格。
- [`../WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx`](../WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx)：阅读与归档版完整设计方案。
- [`product/V1_SCOPE_AND_ACCEPTANCE.md`](product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0范围、V1.5延期项、非目标和关闭条件。
- [`product/FUNCTION_CATALOG.md`](product/FUNCTION_CATALOG.md)：完整功能、效果、实现、依赖和交互清单。
- [`product/V1.0_TRACEABILITY_MATRIX.md`](product/V1.0_TRACEABILITY_MATRIX.md)：需求、设计、任务、实现和验收追踪。
- [`roadmap/V1.0_ROADMAP.md`](roadmap/V1.0_ROADMAP.md)：M0—M5路线图。

## 4. 开发流程

- [`../WorldForge_Codex_全流程技术开发指南.md`](../WorldForge_Codex_全流程技术开发指南.md)：详细架构、阶段实施、提示模板、发布门和Definition of Done。
- [`process/CODEX_EXECUTION_PLAYBOOK.md`](process/CODEX_EXECUTION_PLAYBOOK.md)：日常执行闭环。
- [`tasks/TASK_TEMPLATE.md`](tasks/TASK_TEMPLATE.md)：任务卡模板。
- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)：全部独立任务卡、依赖和状态。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：当前任务控制文件。

## 5. 一任务一文件

### M0 工程与安全底座

- [`M0-01`](tasks/M0/M0-01_MONOREPO_FOUNDATION.md)
- [`M0-02`](tasks/M0/M0-02_ELECTRON_SECURITY.md)
- [`M0-03`](tasks/M0/M0-03_SQLITE_WRITE_QUEUE.md)
- [`M0-04`](tasks/M0/M0-04_IPC_STREAMING.md)
- [`M0-05`](tasks/M0/M0-05_DISPLAY_SCALING_SPIKE.md)
- [`M0-06`](tasks/M0/M0-06_AI_DIFF_SPIKE.md)

### M1 编辑与版本核心

- [`M1-01`](tasks/M1/M1-01_PROJECT_WORKSPACE.md)
- [`M1-02`](tasks/M1/M1-02_DRAFT_EDITOR.md)
- [`M1-03`](tasks/M1/M1-03_LOCK_REVISION.md)
- [`M1-04`](tasks/M1/M1-04_CANDIDATE_VERSION.md)
- [`M1-05`](tasks/M1/M1-05_STRUCTURE_RECOVERY.md)

### M2 规划与连续性

- [`M2-01`](tasks/M2/M2-01_PLANNING_MODEL.md)
- [`M2-02`](tasks/M2/M2-02_CANON_STATE.md)
- [`M2-03`](tasks/M2/M2-03_CONTINUITY_MODELS.md)
- [`M2-04`](tasks/M2/M2-04_STATE_PROPOSALS_SNAPSHOTS.md)

### M3 AI生成闭环

- [`M3-01`](tasks/M3/M3-01_PROVIDER_LAYER.md)
- [`M3-02`](tasks/M3/M3-02_CONSTRAINT_PACKAGE.md)
- [`M3-03`](tasks/M3/M3-03_GENERATION_WORKFLOWS.md)
- [`M3-04`](tasks/M3/M3-04_CANDIDATE_REVIEW.md)

### M4 完整交付

- [`M4-01`](tasks/M4/M4-01_VALIDATION_REVISION.md)
- [`M4-02`](tasks/M4/M4-02_SEARCH_DICTIONARY.md)
- [`M4-03`](tasks/M4/M4-03_IMPORT_EXPORT.md)
- [`M4-04`](tasks/M4/M4-04_BACKUP_RECOVERY.md)
- [`M4-05`](tasks/M4/M4-05_COMPLETE_UI.md)

### M5 发布硬化

- [`M5-01`](tasks/M5/M5-01_SECURITY_DATA_HARDENING.md)
- [`M5-02`](tasks/M5/M5-02_PERFORMANCE_EVAL.md)
- [`M5-03`](tasks/M5/M5-03_RELEASE_ACCEPTANCE.md)

`M0_TASKS.md`至`M5_TASKS.md`只作为里程碑摘要，不再作为单任务执行依据。

## 6. 工程架构

- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)：Main、Preload、Renderer、Core、并发和数据权威。
- [`architecture/MODULE_BOUNDARIES.md`](architecture/MODULE_BOUNDARIES.md)：包职责和禁止依赖。
- [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md)：编辑、AI、Candidate、定稿、导入导出和恢复数据流。

## 7. 架构与实现决策

- [`decisions/README.md`](decisions/README.md)
- [`decisions/ADR-001-local-data-boundary.md`](decisions/ADR-001-local-data-boundary.md)
- [`decisions/ADR-002-sqlite-source-of-truth.md`](decisions/ADR-002-sqlite-source-of-truth.md)
- [`decisions/ADR-003-draft-candidate-version.md`](decisions/ADR-003-draft-candidate-version.md)
- [`decisions/ADR-004-ai-cannot-overwrite-draft.md`](decisions/ADR-004-ai-cannot-overwrite-draft.md)
- [`decisions/ADR-005-lock-revision-backup.md`](decisions/ADR-005-lock-revision-backup.md)
- [`decisions/IMPLEMENTATION_DECISIONS.md`](decisions/IMPLEMENTATION_DECISIONS.md)：UUID、orderKey、Patch、logicalBlockId、中文FTS、Hash、自动保存和Prompt注册等冻结选择。

## 8. 数据库

- [`database/DATABASE_SCHEMA.md`](database/DATABASE_SCHEMA.md)
- [`database/DATA_DICTIONARY.md`](database/DATA_DICTIONARY.md)
- [`database/MIGRATION_POLICY.md`](database/MIGRATION_POLICY.md)
- [`database/SCHEMA_COMPATIBILITY.md`](database/SCHEMA_COMPATIBILITY.md)

## 9. IPC与事件

- [`contracts/IPC_CONTRACTS.md`](contracts/IPC_CONTRACTS.md)
- [`contracts/ERROR_CODES.md`](contracts/ERROR_CODES.md)
- [`contracts/EVENT_PROTOCOL.md`](contracts/EVENT_PROTOCOL.md)

## 10. AI、Prompt与Eval

- [`ai/LOCAL_AI_SERVICE_SPEC.md`](ai/LOCAL_AI_SERVICE_SPEC.md)
- [`ai/PROVIDER_PROTOCOL.md`](ai/PROVIDER_PROTOCOL.md)
- [`ai/PROMPT_AND_EVAL_SPEC.md`](ai/PROMPT_AND_EVAL_SPEC.md)

## 11. UI与交互

- [`ui/README.md`](ui/README.md)
- [`ui/UI_SYSTEM.md`](ui/UI_SYSTEM.md)
- [`ui/INFORMATION_ARCHITECTURE.md`](ui/INFORMATION_ARCHITECTURE.md)
- [`ui/SCREEN_SPECIFICATIONS.md`](ui/SCREEN_SPECIFICATIONS.md)
- [`ui/INTERACTION_STATES.md`](ui/INTERACTION_STATES.md)
- [`ui/EDITOR_INTERACTION_SPEC.md`](ui/EDITOR_INTERACTION_SPEC.md)
- [`ui/CANDIDATE_REVIEW_SPEC.md`](ui/CANDIDATE_REVIEW_SPEC.md)
- [`ui/ONBOARDING_SPEC.md`](ui/ONBOARDING_SPEC.md)
- [`ui/VISUAL_REFERENCE_BASELINE.md`](ui/VISUAL_REFERENCE_BASELINE.md)
- [`ui/RESPONSIVE_AND_DPI.md`](ui/RESPONSIVE_AND_DPI.md)
- [`ui/ACCESSIBILITY.md`](ui/ACCESSIBILITY.md)
- [`ui/UI_ACCEPTANCE_CHECKLIST.md`](ui/UI_ACCEPTANCE_CHECKLIST.md)

## 12. 安全与隐私

- [`../SECURITY.md`](../SECURITY.md)
- [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md)
- [`security/PRIVACY_AND_LOGGING.md`](security/PRIVACY_AND_LOGGING.md)

## 13. 测试与验收

- [`testing/TEST_STRATEGY.md`](testing/TEST_STRATEGY.md)
- [`testing/P0_ACCEPTANCE_MATRIX.md`](testing/P0_ACCEPTANCE_MATRIX.md)
- [`testing/PERFORMANCE_BUDGETS.md`](testing/PERFORMANCE_BUDGETS.md)
- [`testing/SECURITY_TEST_CASES.md`](testing/SECURITY_TEST_CASES.md)

## 14. 后续按真实实现生成

- 本地开发、调试、构建和安装指南。
- 用户快速开始、用户手册、备份恢复指南和FAQ。
- LICENSE、CONTRIBUTING、CHANGELOG、第三方许可证和发布检查。

不得提前虚构命令、构建结果、页面完成状态和平台兼容结论。

## 15. 维护规则

1. 功能变化同步范围、功能清单、追踪矩阵和任务卡。
2. 数据变化同步Schema、数据字典、Migration、兼容策略和测试。
3. IPC变化同步契约、错误码、事件、Preload和测试。
4. Prompt变化同步Prompt/Eval规格、Registry和支持档案。
5. UI变化同步专项规格、视觉基线和验收清单。
6. 安全变化同步安全策略、威胁模型、测试和AGENTS。
7. 文档与代码冲突时先明确变更依据，不得静默漂移。
