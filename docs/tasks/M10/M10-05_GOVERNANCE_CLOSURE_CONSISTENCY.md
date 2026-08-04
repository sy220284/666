# M10-05 治理闭环一致性修复

> 状态：Implemented  
> 优先级：P0  
> 基线：`main == work == f6197ed9b3c6c01ddabd5d42f6703c289b41cbc7`

## 目标

修复 M10-04 兼容面退役后暴露的治理链残留，使 Evidence、发布资格、任务有效状态、分支卫生和合并后闭环使用同一套 Schema 2 语义。禁止恢复 `ACTIVE_TASK.json/.md` 或旧 `taskctl`。

## 已实施

1. `evidence-policy.mjs` 的无 Evidence 变更路径不再读取任何已退役锚点。
2. 发布门强制当前提交拥有 `main-verification=success`。
3. `.github/governance/effective-task-status.mjs` 统一任务 Context 和主线 Context 判断。
4. 全量 Evidence 扫描读取 Runtime、索引和当前提交状态，纳入有效 Verified 任务。
5. Evidence manifest 使用 `implementationCommit`；CI Check 绑定精确 PR Head。
6. Branch Hygiene 只保护授权中的 `main` 与 `work`，取消 `release/*` 例外。
7. Work Synchronization 写入后复读 `work` Ref，并断言与已验证 `main` 相等。
8. `PROJECT_EXECUTION_ENTRY` 和 `TASK_INDEX` 不再固化活动 PR、瞬时状态或当前 Head 快照。
9. Evidence 与 Release 工作流使用最小 `statuses: read` 权限读取提交状态。

## 验收

- 无 Evidence 文件变更的 PR 不读取任何已退役文件，Evidence Gate 正常结束。
- 缺少 `main-verification` 的提交无法通过 Release Gate。
- Runtime 为 `IMPLEMENTED` 且任务 Context 成功时，全量 Evidence 扫描包含该任务。
- 新 Evidence Schema 明确区分实现提交与 CI 精确 Head；历史 Schema 1 Evidence 保持只读兼容。
- `release/*` 不再被 Branch Hygiene 自动保护。
- Work Synchronization 对重置后的 Ref 执行后置断言。
- PROJECT_EXECUTION_ENTRY 不再固化活动 PR、瞬时状态或“最新 SHA”快照。
- Unit、Integration、Security、Performance、Evidence、Task Governance、PR Policy、Quality 全部按永久路由通过。

## 当前验证

实现提交 `e893677fbb037f01c70a28d12063395282fa37c0` 已通过 Draft 阶段的 Workspace、Boundaries、Format、Lint、Typecheck、Security、Performance、Evidence、Repository Governance、Task Governance 与 PR Policy。

最终产品矩阵、E2E、构建和路径路由由 PR #313 的 Ready Head 执行；合并后由 `main-verification`、`task-verification/M10-05` 和 `main == work` 计算仓库闭环。

## 回退

整体回退本任务 PR。不得恢复 `ACTIVE_TASK`、旧 `taskctl` 或额外分支例外；若新状态核心出现问题，应回退消费者接入，同时保留 Schema 2 真源与安全阻断。
