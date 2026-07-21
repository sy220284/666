# WorldForge 当前活动任务

> 本文件由 `docs/tasks/ACTIVE_TASK.json` 生成，请勿手工维护任务字段。

## 当前状态

```text
IN_PROGRESS
```

- 任务ID：`M3-07`
- 唯一任务卡：`docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md`
- 工作分支：`work/m3-07-renderer-react-foundation`
- 开始时间：`2026-07-21`
- 授权模式：`implementation-pr`
- 授权人：`author`

## 执行范围

```yaml
allowed_paths:
  - apps/desktop/renderer/
  - package.json
  - pnpm-lock.yaml
  - tests/unit/
  - tests/security/
  - tests/e2e/
  - docs/architecture/
  - docs/ui/
  - pnpm-workspace.yaml
  - docs/tasks/ACTIVE_TASK.json
  - docs/tasks/ACTIVE_TASK.md
  - docs/tasks/TASK_INDEX.md
  - docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md
  - docs/product/V1.0_TRACEABILITY_MATRIX.md
  - docs/test-evidence/M3-07/
forbidden_paths:

required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/architecture/ARCHITECTURE.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/ui/INFORMATION_ARCHITECTURE.md
  - docs/ui/SCREEN_SPECIFICATIONS.md
  - docs/ui/INTERACTION_STATES.md
  - docs/ui/UI_SYSTEM.md
  - docs/ui/ACCESSIBILITY.md
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm test:security
  - pnpm test:e2e
  - pnpm test:unit
  - pnpm test:integration
  - pnpm test:eval
```

## 连续执行规则

当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。
