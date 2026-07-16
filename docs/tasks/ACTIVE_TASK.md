# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M1-04`
- 唯一任务卡：`docs/tasks/M1/M1-04_DRAFT_EDITOR_IME.md`
- 工作分支：`main`
- 开始时间：`2026-07-16`
- 授权模式：`implementation-mainline`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - migrations/project/
  - packages/editor-core/
  - packages/domain/
  - packages/core-service/
  - packages/contracts/
  - apps/desktop/renderer/
  - tests/e2e/
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M1/M1-04_DRAFT_EDITOR_IME.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M1-04/
  - docs/tasks/M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/ui/EDITOR_INTERACTION_SPEC.md
  - docs/database/DATABASE_SCHEMA.md
  - docs/testing/PERFORMANCE_BUDGETS.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:migration
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:e2e
  - pnpm test:unit
```

## 连续执行规则

当前作者已授权实现优先顺序推进：每次只编程一张任务卡；真实代码、必要专项测试和远端质量门通过后标记 Implemented，并把证据、截图、人工验收与最终 Verified 关闭登记到 deferredVerification 后推进下一张。任何代码、测试、安全或数据边界失败仍立即阻断；延期项不得冒充 Verified 或用于发布。
