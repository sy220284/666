# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M0-06`
- 唯一任务卡：`docs/tasks/M0/M0-06_DISPLAY_WINDOW_SPIKE.md`
- 工作分支：`main`
- 开始时间：`2026-07-15`
- 授权模式：`continuous-mainline`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/main/
  - apps/desktop/renderer/
  - packages/core-service/
  - migrations/app/
  - tests/e2e/
  - tests/performance/
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M0/M0-06_DISPLAY_WINDOW_SPIKE.md
  - docs/tasks/M0/M0-05_TESTKIT_FAULT_INJECTION.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M0-06/
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/ui/RESPONSIVE_AND_DPI.md
  - docs/ui/UI_SYSTEM.md
  - docs/testing/PERFORMANCE_BUDGETS.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:migration
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:e2e
  - pnpm test:perf
```

## 连续执行规则

当前作者已预授权在 `main` 上连续执行。每次仍只允许一张任务卡；当前任务达到 Verified、证据完整且依赖门通过后，可自动激活下一张依赖已满足的任务。失败时必须转为 Blocked，禁止跳过失败或伪造通过。
