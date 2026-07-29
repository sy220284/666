# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
VERIFIED_HOLD
```

- 任务ID：`M8-04`
- 唯一任务卡：`docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md`
- 工作分支：`work/m8-04-author-experience-language`
- 开始时间：`2026-07-29`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/renderer/
  - apps/desktop/preload/
  - apps/desktop/main/
  - packages/contracts/
  - packages/core-service/
  - tests/unit/
  - tests/integration/
  - tests/security/
  - tests/performance/
  - tests/e2e/
  - scripts/
  - .github/workflows/
  - .github/governance/
  - .github/pull_request_template.md
  - docs/product/
  - docs/ui/
  - docs/testing/
  - docs/process/
  - docs/tasks/
  - docs/test-evidence/M8-04/
  - AGENTS.md
  - agent.md
  - docs/PROJECT_EXECUTION_ENTRY.md
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
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/product/FUNCTION_CATALOG.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/product/AUTHOR_LANGUAGE_GLOSSARY.md
  - docs/ui/UI_ACCEPTANCE_CHECKLIST.md
  - docs/ui/INFORMATION_ARCHITECTURE.md
  - docs/ui/SCREEN_SPECIFICATIONS.md
  - docs/ui/INTERACTION_STATES.md
  - docs/ui/EDITOR_INTERACTION_SPEC.md
  - docs/security/THREAT_MODEL.md
  - docs/security/PRIVACY_AND_LOGGING.md
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
  - pnpm build
```

## 连续执行规则

V1.0全部独立任务已经Verified；M8-04作为终态验证锚点保留，不再激活后续任务。任何新功能或公开分发能力必须重新立项。
