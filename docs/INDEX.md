# WorldForge 文档总索引

> 基线：WorldForge V6.5  
> 原则：产品设计真源集中；已完成任务冻结；V1剩余功能由一个整体任务统一规划和实施；验收必须有证据。

## 1. 唯一工作入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ M4-04唯一整体任务卡
→ 原M4-05—M8-03需求来源与专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

- [`../AGENTS.md`](../AGENTS.md)：仓库级强制规则。
- [`../agent.md`](../agent.md)：人工和通用代理快速入口。
- [`PROJECT_EXECUTION_ENTRY.md`](PROJECT_EXECUTION_ENTRY.md)：单一整体任务执行入口与专项路由。
- [`tasks/ACTIVE_TASK.json`](tasks/ACTIVE_TASK.json)：机器可读活动任务与授权真源。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：由JSON生成的人类可读镜像。
- [`tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`](tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)：V1剩余功能唯一整体任务与整体规划门。
- [`process/CODEX_EXECUTION_PLAYBOOK.md`](process/CODEX_EXECUTION_PLAYBOOK.md)：实施、测试、复查与关闭规则。
- [`process/DEVELOPMENT_AUTOMATION.md`](process/DEVELOPMENT_AUTOMATION.md)：PR、质量门禁与受控合并。

## 2. 权威层级

```text
作者最新明确指令
> ACTIVE_TASK与M4-04批准范围
> product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> decisions/IMPLEMENTATION_DECISIONS.md
> AGENTS.md与执行手册
> 现有实现
```

任务执行形式以`TASK_INDEX.md`和`V1_TASK_SYSTEM_REBASE.md`为准；具体产品、Schema、IPC、AI、UI和验收语义继续由专项真源负责。

## 3. 产品、范围与路线

- [`product/WORLDFORGE_V6.5_FULL_SPEC.md`](product/WORLDFORGE_V6.5_FULL_SPEC.md)：产品原则、总体架构、完整功能边界和唯一真源路由。
- [`product/V1_TASK_SYSTEM_REBASE.md`](product/V1_TASK_SYSTEM_REBASE.md)：34张独立任务与20份被吸收需求来源的执行基线。
- [`product/V1_SCOPE_AND_ACCEPTANCE.md`](product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0 P0/P1、V1.5延期项和关闭条件。
- [`product/FUNCTION_CATALOG.md`](product/FUNCTION_CATALOG.md)：功能ID、设计语义和版本归属。
- [`product/V1.0_TRACEABILITY_MATRIX.md`](product/V1.0_TRACEABILITY_MATRIX.md)：需求、M4-04统一执行和验收追踪。
- [`roadmap/V1.0_ROADMAP.md`](roadmap/V1.0_ROADMAP.md)：已完成基线与M4-04六个内部阶段。

## 4. 任务体系

- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)：34张独立任务、吸收关系和当前状态。
- [`tasks/TASK_TEMPLATE.md`](tasks/TASK_TEMPLATE.md)：任务卡和执行附件通用规则。
- [`tasks/ACTIVE_TASK.md`](tasks/ACTIVE_TASK.md)：当前唯一任务控制镜像。
- [`tasks/M0_TASKS.md`](tasks/M0_TASKS.md)至[`tasks/M4_TASKS.md`](tasks/M4_TASKS.md)：已完成阶段与整体任务摘要。
- [`tasks/M5_TASKS.md`](tasks/M5_TASKS.md)至[`tasks/M8_TASKS.md`](tasks/M8_TASKS.md)：被M4-04吸收的需求摘要，不是独立执行入口。

```text
M0—M3 Verified
→ M4-01 FTS Verified
→ M4-02 ConstraintPackage Verified
→ M4-03 Provider Verified
→ M4-04 V1剩余功能整体实施与发布闭环 In Progress
```

原M4-05—M8-03文件保留详细要求，统一标记为被吸收需求来源。只有`ACTIVE_TASK`指向的M4-04可执行；已完成任务卡保持冻结。

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

1. 功能变化同步范围、功能清单、追踪矩阵和M4-04任务卡。
2. 执行顺序变化同步重排基线、路线图、任务索引、摘要和执行入口。
3. 数据变化同步Schema、数据字典、Migration、兼容策略和测试。
4. IPC变化同步契约、错误码、事件、Preload和测试。
5. Prompt变化同步Prompt/Eval、Registry和支持档案。
6. UI变化同步专项规格、视觉基线和验收清单。
7. 已完成任务卡不得静默回写；兼容扩展由M4-04承接。
8. 原被吸收任务的要求不得因取消独立执行而丢失。
9. 文档与代码冲突时先在M4-04整体规划中明确依据和影响，不得静默漂移。
