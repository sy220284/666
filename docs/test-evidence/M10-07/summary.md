# M10-07 实施验证摘要

- 任务：正文变更与恢复安全收口。
- 来源 PR：#315。
- 实现提交：`6fb8c90147894398ba980e2efc192f607515b936`。
- 格式工具：由 GitHub Actions 工作流导出的锁定 Formatter Artifact，Prettier 3.9.5、pnpm 11.13.1。

## 已实施

1. Safe Replace 仅提升实际命中块的 Revision，未命中块保持原 Revision，数据库与 Patch Log 审计一致。
2. Safe Replace 的 stale 后置标记改为 best-effort，后置失败不会覆盖原始替换错误。
3. Version Restore 增加当前 Draft ID 与 Revision 乐观锁，并在同一事务内创建恢复前自动 checkpoint Version。
4. Candidate Undo 强制断言 ApplyRecord 从 applied 到 undone 恰好影响一行，失败时整笔事务回滚。
5. Generation Prose 与 Structured 共用 Provider 流、阶段、usage、字符上限、完成检查和失败持久化生命周期。
6. Candidate、Draft、Version、Import、LockGuard 与 Recovery 统一复用确定性 JSON 序列化，并以黄金向量锁定既有 Hash。

## Draft 验证

Task Validation、Workspace、Boundaries、Format、Lint、Typecheck、Security、Performance、Evidence、Task Governance 与 PR Policy 已通过。

## Ready 验证

单元、集成、Migration、覆盖率、构建、桌面 E2E 与完整质量聚合由 PR #315 Ready Head 执行。
