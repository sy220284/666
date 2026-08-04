# M10-06 历史验证状态继承

> 状态：In Progress  
> 优先级：P0  
> 基线：`main == work == 78e279ebf719b7c3ae4d3a592b38e2ad681d4f1e`

## 目标

修复任务验证 Context 只存在于各自合并提交、无法被后续 main 提交继承的问题。发布资格与全量 Evidence 扫描必须按每个 Schema 2 Runtime 的来源 PR，解析其真实合并提交并读取对应 `task-verification/<TASK-ID>`，不得只复用当前 main 的状态列表。

## 范围

1. 为有效状态策略增加来源 PR 合并提交解析与历史任务状态加载。
2. Release Gate 对每个 Implemented Runtime 使用其来源合并提交的任务 Context。
3. Verified Evidence Scan 使用同一历史状态映射。
4. 当前 main 仍必须具备 `main-verification=success`。
5. GitHub API、来源 PR 或提交状态不可用时默认阻断。
6. Evidence 与 Release 工作流补充最小 `pull-requests: read` 权限。
7. 增加跨两个连续任务提交的回归测试。

## 验收

- 当前 main 仅含 M10-05 Context 时，M10-04 仍能通过 PR #312 合并提交上的任务 Context 被判为有效 Verified。
- 缺失、未合并、来源分支错误或任务 Context 失败时拒绝继承。
- Release Gate 与全量 Evidence Scan 共享同一映射，不再各自解释。
- 所有永久门禁通过，合并后 `main == work`。
