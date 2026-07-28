# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M4-04`
- 唯一任务卡：`docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`
- 工作分支：`work/m4-04-v1-integrated-delivery`
- 开始时间：`2026-07-25`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/
  - packages/
  - migrations/
  - evals/
  - tests/
  - scripts/
  - .github/workflows/
  - .github/governance/
  - docs/
  - README.md
  - SECURITY.md
  - CHANGELOG.md
  - LICENSE
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - vitest.config.ts
  - vitest.coverage.config.ts
forbidden_paths:
  - docs/tasks/M0/
  - docs/tasks/M1/
  - docs/tasks/M2/
  - docs/tasks/M3/
  - docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md
  - docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md
  - docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md
  - docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/product/FUNCTION_CATALOG.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/testing/P0_ACCEPTANCE_MATRIX.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/database/DATABASE_SCHEMA.md
  - docs/contracts/IPC_CONTRACTS.md
  - docs/contracts/EVENT_PROTOCOL.md
  - docs/contracts/ERROR_CODES.md
  - docs/ai/PROMPT_AND_EVAL_SPEC.md
  - docs/ai/PROVIDER_PROTOCOL.md
  - docs/security/THREAT_MODEL.md
  - docs/security/PRIVACY_AND_LOGGING.md
  - docs/ui/UI_ACCEPTANCE_CHECKLIST.md
  - docs/testing/PERFORMANCE_BUDGETS.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:unit
  - pnpm test:integration
  - pnpm test:migration
  - pnpm test:security
  - pnpm test:e2e
  - pnpm test:eval
  - pnpm test:perf
  - pnpm build
```

## 连续执行规则

当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。

M4-04只关闭C0—C7与C1并发硬化；C8由`M8-02`独立承接并保持Planned，未经作者明确指令不得自动激活。