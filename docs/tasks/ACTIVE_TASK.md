# WorldForge 当前活动任务

> 状态：Frozen control file  
> 用途：告诉Codex当前唯一允许执行的开发任务。每次任务切换必须更新本文件。

## 当前状态

```text
NO_ACTIVE_CODING_TASK
```

当前仓库处于文档与规格补全阶段，尚未授权开始代码工程初始化。

## 下一候选任务

- 任务ID：`M0-01`
- 名称：Monorepo与质量工具
- 唯一任务卡：`docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md`
- 前置依赖：无
- 建议分支：`feat/m0-monorepo-foundation`
- 关联需求：`REQ-001`
- 关联验收：`P0-001`

Codex不得因为本节列出下一候选任务而自行开始编码。只有作者明确要求开始M0-01，并将状态更新为`IN_PROGRESS`后，才允许实施。

## 激活任务时填写

```yaml
task_id: M0-01
status: IN_PROGRESS
source: docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md
branch: feat/m0-monorepo-foundation
started_at: YYYY-MM-DD
approved_by: author
allowed_paths:
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - apps/
  - packages/
  - tests/
  - scripts/
  - .github/workflows/
  - docs/test-evidence/M0-01/
forbidden_paths:
  - migrations/project/business-tables
  - packages/prompts/templates/production
required_docs:
  - AGENTS.md
  - docs/PROJECT_EXECUTION_ENTRY.md
  - docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
  - docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md
  - docs/architecture/ARCHITECTURE.md
  - docs/architecture/MODULE_BOUNDARIES.md
  - docs/decisions/IMPLEMENTATION_DECISIONS.md
  - docs/testing/TEST_STRATEGY.md
verification:
  - pnpm install --frozen-lockfile
  - pnpm lint
  - pnpm typecheck
  - pnpm test
  - pnpm build
```

## 完成任务时填写

```yaml
task_id: M0-01
status: VERIFIED
commit: <sha>
evidence: docs/test-evidence/M0-01/
traceability_updated: true
remaining_risks: []
next_candidate: M0-02
```

完成并提交后，将当前状态恢复为`NO_ACTIVE_CODING_TASK`，等待作者激活下一任务。

## 控制规则

1. 同一时间只能有一个活动开发任务。
2. 每个活动任务必须指向一份独立任务卡，里程碑摘要不能替代任务卡。
3. 文档审查或故障分析可以并行，但不得修改活动任务之外的生产代码。
4. 活动任务范围变化时，先更新本文件，再修改代码。
5. 任务Blocked时记录阻断原因、已完成部分、数据安全状态和回退方式。
6. 不允许通过聊天口头概述替代本文件状态。
7. `NO_ACTIVE_CODING_TASK`状态下只能分析、补文档或制定计划，不得自行编码。
