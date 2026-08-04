# M10-05 治理闭环一致性修复

> 状态：In Progress  
> 优先级：P0  
> 基线：`main == work == f6197ed9b3c6c01ddabd5d42f6703c289b41cbc7`

## 目标

修复 M10-04 兼容面退役后暴露的治理链残留，使 Evidence、发布资格、任务有效状态、分支卫生和合并后闭环使用同一套 Schema 2 语义。禁止恢复 `ACTIVE_TASK.json/.md` 或旧 `taskctl`。

## 问题范围

1. Evidence 无变更路径仍读取已删除的 `ACTIVE_TASK.json`。
2. 发布门未强制当前提交拥有 `main-verification=success`。
3. 有效 Verified 与 TASK_INDEX 字面状态不一致，导致全量 Evidence 扫描漏项。
4. Evidence 文档中的实现提交与 CI 精确受检 Head 语义混用。
5. Branch Hygiene 仍对 `release/*` 保留额外分支例外。
6. 合并完成、Main Verification 与 `work` 同步缺少统一的最终闭环判定。
7. 权威执行入口固化活动 PR、瞬时状态和历史 SHA，合并后立即过期。

## 实施原则

- `.github/governance/effective-task-status.mjs` 作为有效任务状态与提交 Context 判断的唯一策略核心。
- Evidence manifest 只绑定实现提交；CI Evidence Check 绑定精确 PR Head，二者职责分离。
- 发布资格必须同时要求当前提交的 `main-verification` 成功。
- 全量 Evidence 扫描读取 Runtime、索引和当前提交状态，纳入有效 Verified 任务。
- Branch Hygiene 只保护授权中的 `main` 与 `work`。
- Work Synchronization 完成后必须复读 `work` Ref 并断言等于已验证 `main`。
- 权威入口只描述稳定规则；动态状态由 Runtime、开放 PR 与 Commit Status 解析。

## 验收

- 无 Evidence 文件变更的 PR 不读取任何已退役文件，Evidence Gate 正常结束。
- 缺少 `main-verification` 的提交无法通过 Release Gate。
- Runtime 为 `IMPLEMENTED` 且任务 Context 成功时，全量 Evidence 扫描包含该任务。
- 新 Evidence Schema 明确区分实现提交与 CI 精确 Head；历史 Schema 1 Evidence 保持只读兼容。
- `release/*` 不再被 Branch Hygiene 自动保护。
- Work Synchronization 对重置后的 Ref 执行后置断言。
- PROJECT_EXECUTION_ENTRY 不再固化活动 PR、瞬时状态或“最新 SHA”快照。
- Unit、Integration、Security、Performance、Evidence、Task Governance、PR Policy、Quality 全部按永久路由通过。

## 回退

整体回退本任务 PR。不得恢复 `ACTIVE_TASK`、旧 `taskctl` 或额外分支例外；若新状态核心出现问题，应回退消费者接入，同时保留 Schema 2 真源与安全阻断。