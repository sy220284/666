# M10-06 实施验证摘要

- 任务：历史验证状态继承。
- 来源 PR：#314。
- 实现提交：`46f866e3f05770bd2b19a0a91e0ba4454cea5e61`。

## 已实施

1. 当前 main 只使用自身 `main-verification`。
2. 历史 Implemented Runtime 按 `sourcePr` 在当前祖先链精确定位受控 Squash 提交。
3. 从各来源提交读取对应 `task-verification/<TASK-ID>`。
4. 合并状态时只继承任务 Context，禁止继承旧主线 Context。
5. 来源提交无法唯一解析、任务 Context 缺失或状态查询失败时默认阻断。
6. Release Gate 与全量 Evidence 扫描继续复用统一 `loadCommitStatuses()`。

## Draft 验证

Workspace、Boundaries、Format、Lint、Typecheck、Security、Performance、Evidence、Repository Governance、Task Governance 与 PR Policy 已通过。
