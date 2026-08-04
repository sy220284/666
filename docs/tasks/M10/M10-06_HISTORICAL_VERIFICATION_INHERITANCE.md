# M10-06 历史验证状态继承

> 状态：Implemented  
> 优先级：P0  
> 基线：`main == work == 78e279ebf719b7c3ae4d3a592b38e2ad681d4f1e`

## 目标

修复任务验证 Context 只存在于各自合并提交、无法被后续 main 提交继承的问题。发布资格与全量 Evidence 扫描必须按每个 Schema 2 Runtime 的来源 PR，解析其真实合并提交并读取对应 `task-verification/<TASK-ID>`，不得只复用当前 main 的状态列表。

## 已实施

1. 统一状态核心从当前提交祖先链中按 Runtime `sourcePr` 精确定位受控 Squash 提交。
2. 对每个历史 Implemented Runtime，从对应合并提交读取自己的任务 Context。
3. 当前提交的状态与历史任务状态合并时，只继承 `task-verification/*`。
4. 历史 `main-verification` 不会被继承，当前 main 仍必须单独验证成功。
5. 来源提交无法唯一定位、任务 Context 缺失或 GitHub 状态查询失败时默认阻断。
6. Release Gate 与全量 Evidence Scan 继续共享同一个 `loadCommitStatuses()`，没有新增解释分支。
7. 回归测试覆盖连续两个任务提交、错误 PR 编号及旧主线 Context 不得继承。

## 验收

- 当前 main 仅含 M10-05 Context 时，M10-04 仍能通过 PR #312 合并提交上的任务 Context 被判为有效 Verified。
- 缺失、来源提交不唯一或任务 Context 失败时拒绝继承。
- 当前主线 Context 与历史任务 Context 职责分离。
- 所有永久门禁通过，合并后 `main == work`。

## 当前验证

实现提交 `46f866e3f05770bd2b19a0a91e0ba4454cea5e61` 已通过 Draft 阶段的格式、Lint、Typecheck、Security、Performance、Evidence、Repository Governance、Task Governance 与 PR Policy。最终完整矩阵由 PR #314 Ready Head 执行。
