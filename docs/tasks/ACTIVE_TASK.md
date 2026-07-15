# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M0-01`
- 唯一任务卡：`docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md`
- 工作分支：`main`
- 开始时间：`2026-07-15`
- 授权模式：`continuous-mainline`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - eslint.config.mjs
  - prettier.config.mjs
  - vitest.config.ts
  - .npmrc
  - .gitignore
  - apps/
  - packages/
  - tests/
  - scripts/
  - .github/workflows/
  - AGENTS.md
  - agent.md
  - README.md
  - docs/INDEX.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/process/CODEX_EXECUTION_PLAYBOOK.md
  - docs/process/DEVELOPMENT_AUTOMATION.md
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M0-01/
forbidden_paths:
  - migrations/project/business-tables/
  - packages/prompts/production-templates/
  - docs/tasks/M1/
  - docs/tasks/M2/
  - docs/tasks/M3/
  - docs/tasks/M4/
  - docs/tasks/M5/
  - docs/tasks/M6/
  - docs/tasks/M7/
  - docs/tasks/M8/
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md
  - docs/architecture/ARCHITECTURE.md
  - docs/architecture/MODULE_BOUNDARIES.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/testing/TEST_STRATEGY.md
verification:
  - pnpm install --frozen-lockfile
  - pnpm check:workspaces
  - pnpm check:boundaries
  - pnpm format:check
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm build
  - pnpm package
```

## 连续执行规则

当前作者已预授权在 `main` 上连续执行。每次仍只允许一张任务卡；当前任务达到 Verified、证据完整且依赖门通过后，可自动激活下一张依赖已满足的任务。失败时必须转为 Blocked，禁止跳过失败或伪造通过。
