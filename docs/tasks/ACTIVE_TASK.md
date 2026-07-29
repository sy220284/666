# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
VERIFIED_HOLD
```

- 任务ID：`M8-02`
- 唯一任务卡：`docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md`
- 工作分支：`work/m8-02-performance-e2e-ai-eval`
- 开始时间：`2026-07-28`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/
  - packages/contracts/
  - packages/core-service/
  - migrations/
  - tests/e2e/
  - tests/unit/
  - tests/performance/
  - tests/security/
  - tests/integration/
  - tests/migration/
  - evals/
  - scripts/
  - .github/workflows/
  - .github/governance/
  - docs/database/
  - docs/ui/
  - docs/testing/
  - docs/security/
  - docs/product/
  - docs/test-evidence/M8-02/
  - docs/PROJECT_EXECUTION_ENTRY.md
  - README.md
  - CHANGELOG.md
  - LICENSE
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/product/FUNCTION_CATALOG.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/product/SELF_USE_RELEASE_POLICY.md
  - docs/testing/P0_ACCEPTANCE_MATRIX.md
  - docs/testing/PERFORMANCE_BUDGETS.md
  - docs/ui/UI_ACCEPTANCE_CHECKLIST.md
  - docs/ai/PROMPT_AND_EVAL_SPEC.md
  - docs/security/THREAT_MODEL.md
  - docs/security/PRIVACY_AND_LOGGING.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:migration
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:e2e
  - pnpm test:unit
  - pnpm test:eval
  - pnpm test:perf
```

## 连续执行规则

V1.0全部独立任务已经Verified；M8-02作为终态验证锚点保留，不再激活后续任务。任何新功能或公开分发能力必须重新立项。
