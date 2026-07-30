# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IMPLEMENTED
```

- 任务ID：`M8-06`
- 唯一任务卡：`docs/tasks/M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md`
- 工作分支：`work/m8-06-release-qualification-governance`
- 开始时间：`2026-07-30`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - scripts/release-tool.mjs
  - tests/unit/release-tool.test.ts
  - .github/workflows/release.yml
  - docs/tasks/
  - docs/process/
  - docs/roadmap/
  - docs/testing/
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M8-06/
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
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md
  - docs/process/DEVELOPMENT_AUTOMATION.md
  - docs/process/WORKFLOW_EXECUTION_ORDER.md
  - docs/process/RELEASE_QUALIFICATION.md
  - docs/roadmap/V1.0_ROADMAP.md
  - docs/testing/P0_ACCEPTANCE_MATRIX.md
  - .github/workflows/release.yml
verification:
  - pnpm check:language
  - pnpm lint
  - pnpm typecheck
  - pnpm test:unit
  - pnpm test
  - pnpm release:check
  - pnpm build
```

## 延期验证

M8-06实现提交`6cf8b81e8ceff9b87c26ad29eaa8bfb0f4c73841`已经通过实现门禁。当前等待正式PR最终Head永久门禁、受控压缩合并、Main Verification、最终Evidence绑定和Verified关闭。

## 连续执行规则

当前作者已授权实现优先的合并请求模式：每张任务必须在独立非main分支完成并提交合并请求；合并请求规则、任务治理、安全、性能、验证记录与质量门禁全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。
