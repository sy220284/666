# WorldForge 文档总索引

> 基线：WorldForge V6.5  
> 当前有效任务、PR、Head与验证状态：按 `PROJECT_EXECUTION_ENTRY.md` 动态解析，本索引不固化瞬时状态。

## 1. 唯一执行入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime
→ 当前任务卡
→ 专项文档、代码、测试、Migration、IPC与Evidence
```

- [`../AGENTS.md`](../AGENTS.md)：仓库级强制规则。
- [`PROJECT_EXECUTION_ENTRY.md`](PROJECT_EXECUTION_ENTRY.md)：当前执行状态与专项路由。
- [`tasks/TASK_AUTHORIZATION.json`](tasks/TASK_AUTHORIZATION.json)：分支、PR、合并和同步规则。
- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)：任务依赖、状态与导航。
- [`tasks/runtime/`](tasks/runtime/)：任务状态、边界、验证命令与提交状态绑定。
- 当前任务卡：由 `PROJECT_EXECUTION_ENTRY.md`、`TASK_AUTHORIZATION.json`、Runtime 与开放 `work → main` PR 动态解析。

`ACTIVE_TASK.json/.md`与旧`taskctl`已经退役，不得重新作为执行入口或状态真源。

## 2. 权威层级

```text
作者最新明确指令
> TASK_AUTHORIZATION、当前Runtime与TASK_INDEX
> 当前任务卡
> product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> decisions/IMPLEMENTATION_DECISIONS.md
> AGENTS.md与执行手册
> 现有实现
```

## 3. 产品与范围

- [`product/WORLDFORGE_V6.5_FULL_SPEC.md`](product/WORLDFORGE_V6.5_FULL_SPEC.md)：完整产品边界和真源路由。
- [`product/FUNCTION_CATALOG.md`](product/FUNCTION_CATALOG.md)：功能ID与版本归属。
- [`product/V1_SCOPE_AND_ACCEPTANCE.md`](product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0范围与关闭条件。
- [`product/V1.0_TRACEABILITY_MATRIX.md`](product/V1.0_TRACEABILITY_MATRIX.md)：需求、任务、实现和验收追踪。
- [`roadmap/V1.0_ROADMAP.md`](roadmap/V1.0_ROADMAP.md)：交付与后续演进。

## 4. 任务、审计与自动化

- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)：独立任务、吸收关系与静态声明状态。
- [`tasks/TASK_TEMPLATE.md`](tasks/TASK_TEMPLATE.md)：任务卡通用规则。
- [`process/USER_PERSPECTIVE_AUDIT_REPORTING.md`](process/USER_PERSPECTIVE_AUDIT_REPORTING.md)：代码、设计、体验、安全、恢复、发布和治理审计的统一用户视角汇报规范。
- [`process/DEVELOPMENT_AUTOMATION.md`](process/DEVELOPMENT_AUTOMATION.md)：唯一work PR、永久门禁和同步闭环。
- [`process/RELEASE_QUALIFICATION.md`](process/RELEASE_QUALIFICATION.md)：基于Runtime和提交状态的发布资格。
- [`process/CODEX_EXECUTION_PLAYBOOK.md`](process/CODEX_EXECUTION_PLAYBOOK.md)：实施、复查与关闭规则。

当前任务与有效状态不在本索引固化；必须按 `PROJECT_EXECUTION_ENTRY.md` 从 Git Ref、开放 PR、Runtime 与 Commit Status 动态解析。

## 5. 架构与实现决策

- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)
- [`architecture/MODULE_BOUNDARIES.md`](architecture/MODULE_BOUNDARIES.md)
- [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md)
- [`architecture/RENDERER_COMPATIBILITY_OWNERSHIP.md`](architecture/RENDERER_COMPATIBILITY_OWNERSHIP.md)
- [`decisions/IMPLEMENTATION_DECISIONS.md`](decisions/IMPLEMENTATION_DECISIONS.md)

## 6. 数据库、IPC与AI

- 数据库：[`database/DATABASE_SCHEMA.md`](database/DATABASE_SCHEMA.md)、[`database/DATA_DICTIONARY.md`](database/DATA_DICTIONARY.md)、[`database/MIGRATION_POLICY.md`](database/MIGRATION_POLICY.md)、[`database/SCHEMA_COMPATIBILITY.md`](database/SCHEMA_COMPATIBILITY.md)
- IPC：[`contracts/IPC_CONTRACTS.md`](contracts/IPC_CONTRACTS.md)、[`contracts/ERROR_CODES.md`](contracts/ERROR_CODES.md)、[`contracts/EVENT_PROTOCOL.md`](contracts/EVENT_PROTOCOL.md)
- AI：[`ai/LOCAL_AI_SERVICE_SPEC.md`](ai/LOCAL_AI_SERVICE_SPEC.md)、[`ai/PROVIDER_PROTOCOL.md`](ai/PROVIDER_PROTOCOL.md)、[`ai/PROMPT_AND_EVAL_SPEC.md`](ai/PROMPT_AND_EVAL_SPEC.md)

## 7. UI与交互

- [`ui/UI_SYSTEM.md`](ui/UI_SYSTEM.md)
- [`ui/INFORMATION_ARCHITECTURE.md`](ui/INFORMATION_ARCHITECTURE.md)
- [`ui/SCREEN_SPECIFICATIONS.md`](ui/SCREEN_SPECIFICATIONS.md)
- [`ui/INTERACTION_STATES.md`](ui/INTERACTION_STATES.md)
- [`ui/EDITOR_INTERACTION_SPEC.md`](ui/EDITOR_INTERACTION_SPEC.md)
- [`ui/CANDIDATE_REVIEW_SPEC.md`](ui/CANDIDATE_REVIEW_SPEC.md)
- [`ui/UI_ACCEPTANCE_CHECKLIST.md`](ui/UI_ACCEPTANCE_CHECKLIST.md)

## 8. 安全、测试与验收

- [`../SECURITY.md`](../SECURITY.md)
- [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md)
- [`security/PRIVACY_AND_LOGGING.md`](security/PRIVACY_AND_LOGGING.md)
- [`testing/TEST_STRATEGY.md`](testing/TEST_STRATEGY.md)
- [`testing/P0_ACCEPTANCE_MATRIX.md`](testing/P0_ACCEPTANCE_MATRIX.md)
- [`testing/PERFORMANCE_BUDGETS.md`](testing/PERFORMANCE_BUDGETS.md)
- [`testing/SECURITY_TEST_CASES.md`](testing/SECURITY_TEST_CASES.md)

## 9. 维护规则

1. 功能变化同步范围、功能目录、追踪矩阵、当前任务卡和验证记录。
2. 执行顺序变化同步任务授权、Runtime、任务索引和执行入口。
3. 数据变化同步Schema、数据字典、Migration、兼容策略和测试。
4. IPC变化同步契约、错误码、事件、Preload和测试。
5. Provider或Prompt变化同步协议、Eval、Registry和支持档案。
6. 已Verified任务卡、Runtime、Migration和Evidence保持冻结；维护由新任务承接。
7. 用户数据兼容不得因内部兼容层退役而削弱。
