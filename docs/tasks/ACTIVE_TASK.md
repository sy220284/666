# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
VERIFIED_HOLD
```

- 任务ID：`M10-02`
- 唯一任务卡：`docs/tasks/M10/M10-02_FULL_CODE_AUDIT.md`
- 工作分支：`work/m10-02-full-code-audit`
- 开始时间：`2026-08-03`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/
  - packages/
  - tests/
  - scripts/
  - .github/
  - docs/tasks/M10/
  - docs/tasks/runtime/M10-02.json
  - docs/tasks/TASK_INDEX.md
  - docs/test-evidence/M10-02/
  - docs/PROJECT_EXECUTION_ENTRY.md
  - package.json
  - pnpm-lock.yaml
forbidden_paths:
  - migrations/
  - docs/test-evidence/M0/
  - docs/test-evidence/M1/
  - docs/test-evidence/M2/
  - docs/test-evidence/M3/
  - docs/test-evidence/M4-04/
  - docs/test-evidence/M8-02/
  - docs/test-evidence/M8-04/
  - docs/test-evidence/M8-05/
  - docs/test-evidence/M8-06/
  - docs/test-evidence/M8-07/
  - docs/test-evidence/M8-08/
  - docs/test-evidence/M8-09/
  - docs/test-evidence/M9-00/
  - docs/test-evidence/M9-02/
  - docs/test-evidence/M9-03/
  - docs/test-evidence/M10-01/
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/TASK_AUTHORIZATION.json
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M10/M10-02_FULL_CODE_AUDIT.md
  - docs/tasks/runtime/M10-02.json
  - docs/test-evidence/M10-02/summary.md
verification:
  - pnpm task:validate
  - pnpm check:workspaces
  - pnpm check:boundaries
  - pnpm check:language
  - pnpm format:check
  - pnpm lint
  - pnpm typecheck
  - pnpm test:unit
  - pnpm test:integration
  - pnpm test:migration
  - pnpm test:coverage
  - pnpm test:security
  - pnpm test:perf
  - pnpm build
  - pnpm test:e2e
  - pnpm release:check
```

## 连续执行规则

V1.0全部独立任务已经Verified；M10-02作为终态验证锚点保留，不再激活后续任务。任何新功能或公开分发能力必须重新立项。
