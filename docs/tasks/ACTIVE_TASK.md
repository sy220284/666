# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M1-02`
- 唯一任务卡：`docs/tasks/M1/M1-02_PROJECT_WORKSPACE_PATHS.md`
- 工作分支：`main`
- 开始时间：`2026-07-16`
- 授权模式：`implementation-mainline`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - packages/core-service/
  - packages/contracts/
  - apps/desktop/main/
  - apps/desktop/preload/
  - apps/desktop/renderer/
  - migrations/project/
  - tests/security/
  - tests/e2e/
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M1/M1-02_PROJECT_WORKSPACE_PATHS.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M1-02/
  - docs/tasks/M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/architecture/ARCHITECTURE.md
  - docs/contracts/IPC_CONTRACTS.md
  - docs/database/SCHEMA_COMPATIBILITY.md
  - docs/security/THREAT_MODEL.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:migration
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:e2e
```

## 连续执行规则

当前作者已授权实现优先顺序推进：每次只编程一张任务卡；真实代码、必要专项测试和远端质量门通过后标记 Implemented，并把证据、截图、人工验收与最终 Verified 关闭登记到 deferredVerification 后推进下一张。任何代码、测试、安全或数据边界失败仍立即阻断；延期项不得冒充 Verified 或用于发布。
