# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M0-02`
- 唯一任务卡：`docs/tasks/M0/M0-02_ELECTRON_CORE_LIFECYCLE.md`
- 工作分支：`main`
- 开始时间：`2026-07-15`
- 授权模式：`continuous-mainline`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/main/
  - apps/desktop/preload/
  - apps/desktop/renderer/
  - packages/contracts/
  - packages/core-service/
  - tests/security/
  - tests/e2e/
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M0/M0-02_ELECTRON_CORE_LIFECYCLE.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M0-02/
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - SECURITY.md
  - docs/security/THREAT_MODEL.md
  - docs/security/PRIVACY_AND_LOGGING.md
  - docs/architecture/ARCHITECTURE.md
  - docs/contracts/IPC_CONTRACTS.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:e2e
```

## 连续执行规则

当前作者已预授权在 `main` 上连续执行。每次仍只允许一张任务卡；当前任务达到 Verified、证据完整且依赖门通过后，可自动激活下一张依赖已满足的任务。失败时必须转为 Blocked，禁止跳过失败或伪造通过。
