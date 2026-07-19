# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M1-08`
- 唯一任务卡：`docs/tasks/M1/M1-08_RECOVERY_READONLY_FOUNDATION.md`
- 工作分支：`work/m1-08-recovery-readonly-foundation`
- 开始时间：`2026-07-18`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - migrations/project/
  - packages/core-service/
  - packages/contracts/
  - apps/desktop/main/
  - apps/desktop/preload/
  - apps/desktop/renderer/
  - tests/integration/
  - tests/migration/
  - tests/security/
  - tests/e2e/
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M1/M1-08_RECOVERY_READONLY_FOUNDATION.md
  - docs/tasks/M3/M3-03_ENTITY_CANON.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M1-08/
  - scripts/taskctl.mjs
  - .github/workflows/quality-core.yml
  - scripts/evidence-policy.mjs
  - tests/unit/evidence-policy.test.ts
  - docs/test-evidence/M0-05/
  - docs/test-evidence/M2-01/
  - docs/test-evidence/M2-02/
  - docs/test-evidence/M2-03/
  - docs/test-evidence/M2-04/
  - docs/tasks/M2/M2-01_LOCK_GUARD.md
  - docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md
  - docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md
  - docs/tasks/M2/M2-04_TRASH_STRUCTURE_RECOVERY.md
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/decisions/ADR-005-lock-revision-backup.md
  - docs/database/DATABASE_SCHEMA.md
  - docs/testing/SECURITY_TEST_CASES.md
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

当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。
