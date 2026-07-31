# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IMPLEMENTED
```

- 任务ID：`M8-07`
- 唯一任务卡：`docs/tasks/M8/M8-07_CHINESE_EXPERIENCE_GOVERNANCE.md`
- 工作分支：`work/m8-07-chinese-experience-governance`
- 开始时间：`2026-07-30`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/renderer/
  - apps/desktop/main/
  - apps/desktop/preload/
  - packages/contracts/
  - packages/testkit/
  - scripts/check-author-language.mjs
  - scripts/release-tool.mjs
  - scripts/task-control-lib.mjs
  - scripts/ui-acceptance-gate.mjs
  - tests/unit/
  - tests/integration/
  - tests/security/
  - tests/performance/
  - tests/e2e/
  - .github/governance/
  - .github/workflows/
  - docs/contracts/
  - docs/product/
  - docs/ui/
  - docs/testing/
  - docs/process/
  - docs/tasks/
  - docs/test-evidence/M8-07/
  - README.md
  - CHANGELOG.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
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
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md
  - docs/tasks/M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md
  - docs/tasks/M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md
  - docs/product/AUTHOR_LANGUAGE_GLOSSARY.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/ui/UI_ACCEPTANCE_CHECKLIST.md
  - docs/ui/ACCESSIBILITY.md
  - docs/ui/RESPONSIVE_AND_DPI.md
  - docs/ui/INTERACTION_STATES.md
  - docs/contracts/ERROR_CODES.md
  - docs/process/RELEASE_QUALIFICATION.md
  - docs/testing/P0_ACCEPTANCE_MATRIX.md
verification:
  - pnpm check:language
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:unit
  - pnpm test:integration
  - pnpm test:security
  - pnpm test:perf
  - pnpm test:e2e
  - pnpm release:check
  - pnpm build
```

## 连续执行规则

当前作者已授权实现优先的合并请求模式：每张任务必须在独立非main分支完成并提交合并请求；合并请求规则、任务治理、安全、性能、验证记录与质量门禁全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。
