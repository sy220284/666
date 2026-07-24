# WorldForge 文档总索引

> 基线：WorldForge V6.5  
> 原则：产品设计真源集中；任务路线独立冻结；一任务一文件；依赖不倒置；验收有证据。

## 1. 唯一工作入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

- [`../AGENTS.md`](../AGENTS.md)：仓库级强制规则。
- [`../agent.md`](../agent.md)：人工和通用代理快速入口。
- [`PROJECT_EXECUTION_ENTRY.md`](PROJECT_EXECUTION_ENTRY.md)：任务类型与专项文档路由。
- [`tasks/ACTIVE_TASK.json`](tasks/ACTIVE_TASK.json)：机器可读的活动任务与连续执行授权真源。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：由JSON生成的人类可读镜像。
- [`process/CODEX_EXECUTION_PLAYBOOK.md`](process/CODEX_EXECUTION_PLAYBOOK.md)：任务启动到关闭的闭环。
- [`process/DEVELOPMENT_AUTOMATION.md`](process/DEVELOPMENT_AUTOMATION.md)：自动推进、主线提交和质量门禁。

## 2. 权威层级

```text
作者最新明确指令
> ACTIVE_TASK已批准范围与验收
> product/WORLDFORGE_V6.5_FULL_SPEC.md（产品原则、总体架构和功能边界）
> product/V1_TASK_SYSTEM_REBASE.md（任务阶段、编号、依赖和阶段门）
> 对应专项唯一真源、ADR和IMPLEMENTATION_DECISIONS
> AGENTS.md、执行手册和开发指南
> 现有实现
```

`WORLDFORGE_V6.5_FULL_SPEC.md`已直接采用M0—M8九阶段和统一功能基线；任务明细只在任务索引、路线图和追踪矩阵维护。完整规格列出的专项唯一真源负责具体Schema、IPC、AI、UI和验收细节。

## 3. 产品、范围与路线

- [`product/WORLDFORGE_V6.5_FULL_SPEC.md`](product/WORLDFORGE_V6.5_FULL_SPEC.md)：产品原则、总体架构、完整功能边界和唯一真源路由。
- [`product/V1_TASK_SYSTEM_REBASE.md`](product/V1_TASK_SYSTEM_REBASE.md)：九阶段、53张任务卡的重排与增补依据。
- [`product/V1_SCOPE_AND_ACCEPTANCE.md`](product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0 P0/P1、V1.5延期项和关闭条件。
- [`product/FUNCTION_CATALOG.md`](product/FUNCTION_CATALOG.md)：功能ID、设计语义和版本归属。
- [`product/V1.0_TRACEABILITY_MATRIX.md`](product/V1.0_TRACEABILITY_MATRIX.md)：需求、任务和验收追踪。
- [`roadmap/V1.0_ROADMAP.md`](roadmap/V1.0_ROADMAP.md)：M0—M8九阶段路线图。

## 4. 任务体系

- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)：53张独立任务卡、依赖和状态。
- [`tasks/TASK_TEMPLATE.md`](tasks/TASK_TEMPLATE.md)：Planned任务卡和ACTIVE执行附件规则。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：任务控制文件。
- [`tasks/M0_TASKS.md`](tasks/M0_TASKS.md)至[`tasks/M8_TASKS.md`](tasks/M8_TASKS.md)：阶段摘要，仅用于导航。

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定、连续性与Renderer架构收口
→ M4 检索与AI基础设施
→ M5 作者体验前置、AI生成与候选审阅
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

独立任务卡位于`tasks/M0/`至`tasks/M8/`。只有`ACTIVE_TASK.md`指向的卡可执行。

## 5. 工程架构与决策

- 架构：[`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)、[`MODULE_BOUNDARIES.md`](architecture/MODULE_BOUNDARIES.md)、[`DATA_FLOW.md`](architecture/DATA_FLOW.md)
- ADR：[`decisions/README.md`](decisions/README.md)
- 冻结实现：[`decisions/IMPLEMENTATION_DECISIONS.md`](decisions/IMPLEMENTATION_DECISIONS.md)

## 6. 数据库、IPC与AI

- 数据库：[`database/DATABASE_SCHEMA.md`](database/DATABASE_SCHEMA.md)、[`DATA_DICTIONARY.md`](database/DATA_DICTIONARY.md)、[`MIGRATION_POLICY.md`](database/MIGRATION_POLICY.md)、[`SCHEMA_COMPATIBILITY.md`](database/SCHEMA_COMPATIBILITY.md)
- IPC：[`contracts/IPC_CONTRACTS.md`](contracts/IPC_CONTRACTS.md)、[`ERROR_CODES.md`](contracts/ERROR_CODES.md)、[`EVENT_PROTOCOL.md`](contracts/EVENT_PROTOCOL.md)
- AI：[`ai/LOCAL_AI_SERVICE_SPEC.md`](ai/LOCAL_AI_SERVICE_SPEC.md)、[`PROVIDER_PROTOCOL.md`](ai/PROVIDER_PROTOCOL.md)、[`PROMPT_AND_EVAL_SPEC.md`](ai/PROMPT_AND_EVAL_SPEC.md)

## 7. UI与交互

- 视觉与主题：[`ui/UI_SYSTEM.md`](ui/UI_SYSTEM.md)、[`ui/UI_SYSTEM_THEME_B.md`](ui/UI_SYSTEM_THEME_B.md)、[`ui/VISUAL_REFERENCE_BASELINE.md`](ui/VISUAL_REFERENCE_BASELINE.md)
- 页面与交互：[`ui/INFORMATION_ARCHITECTURE.md`](ui/INFORMATION_ARCHITECTURE.md)、[`ui/SCREEN_SPECIFICATIONS.md`](ui/SCREEN_SPECIFICATIONS.md)、[`ui/INTERACTION_STATES.md`](ui/INTERACTION_STATES.md)
- 编辑与候选：[`ui/EDITOR_INTERACTION_SPEC.md`](ui/EDITOR_INTERACTION_SPEC.md)、[`ui/CANDIDATE_REVIEW_SPEC.md`](ui/CANDIDATE_REVIEW_SPEC.md)
- 向导与显示：[`ui/ONBOARDING_SPEC.md`](ui/ONBOARDING_SPEC.md)、[`ui/RESPONSIVE_AND_DPI.md`](ui/RESPONSIVE_AND_DPI.md)、[`ui/ACCESSIBILITY.md`](ui/ACCESSIBILITY.md)
- 验收：[`ui/UI_ACCEPTANCE_CHECKLIST.md`](ui/UI_ACCEPTANCE_CHECKLIST.md)

## 8. 安全、测试与验收

- [`../SECURITY.md`](../SECURITY.md)
- [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md)
- [`security/PRIVACY_AND_LOGGING.md`](security/PRIVACY_AND_LOGGING.md)
- [`testing/TEST_STRATEGY.md`](testing/TEST_STRATEGY.md)
- [`testing/P0_ACCEPTANCE_MATRIX.md`](testing/P0_ACCEPTANCE_MATRIX.md)
- [`testing/PERFORMANCE_BUDGETS.md`](testing/PERFORMANCE_BUDGETS.md)
- [`testing/SECURITY_TEST_CASES.md`](testing/SECURITY_TEST_CASES.md)

## 9. 维护规则

1. 功能变化同步范围、功能清单、追踪矩阵和任务卡。
2. 任务依赖变化同步重排基线、路线图、任务索引、摘要和执行入口。
3. 数据变化同步Schema、数据字典、Migration、兼容策略和测试。
4. IPC变化同步契约、错误码、事件、Preload和测试。
5. Prompt变化同步Prompt/Eval、Registry和支持档案。
6. UI变化同步专项规格、视觉基线和验收清单。
7. 文档与代码冲突时先明确变更依据，不得静默漂移。