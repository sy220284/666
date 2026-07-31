# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M8-09`
- 唯一任务卡：`docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md`
- 工作分支：`work/m8-09-v1-stability-hardening`
- 开始时间：`2026-07-31`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/renderer/src/
  - apps/desktop/preload/src/
  - apps/desktop/main/src/
  - packages/contracts/src/
  - packages/core-service/src/
  - tests/unit/
  - tests/integration/
  - tests/security/
  - tests/e2e/
  - scripts/
  - docs/tasks/
  - docs/product/
  - docs/testing/
  - docs/test-evidence/M8-09/
  - .github/workflows/
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
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/TASK_AUTHORIZATION.json
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md
  - docs/tasks/runtime/M8-09.json
verification:
  - pnpm check:language
  - pnpm lint
  - pnpm typecheck
  - pnpm test:unit
  - pnpm test:integration
  - pnpm test:migration
  - pnpm test:coverage
  - pnpm test:security
  - pnpm test:perf
  - pnpm test:e2e
  - pnpm build
  - pnpm release:check
```

## 连续执行规则

当前作者已授权实现优先的合并请求模式：每张任务必须在独立非main分支完成并提交合并请求；合并请求规则、任务治理、安全、性能、验证记录与质量门禁全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。
