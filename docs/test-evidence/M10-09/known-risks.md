# M10-09 已知风险

1. Evidence manifest 绑定 PR 中已验证的实现提交，不预写未来 Squash 合并 SHA。最终主线身份与有效 Verified 继续由 `main-verification` 和 `task-verification/M10-09` 提交状态证明。
2. Ready 收口白名单仅包含当前任务卡、当前 Runtime、`TASK_INDEX.md` 和当前任务 Evidence。若实现、测试或治理脚本继续变化，必须重新冻结实现提交并重建 Evidence，不能扩大白名单绕过。
3. 历史任务 Evidence 若因后续治理需要改写，应绑定仍存在于主线历史的受控合并提交；原 PR Head 可保留在摘要中用于测试追溯。
4. `pnpm/action-setup` 当前仍声明 Node 20，GitHub Actions 在 Node 24 兼容模式下给出弃用警告。现有固定 SHA 可运行，后续应在上游发布兼容版本后单独治理。
5. 新门禁依赖完整 Git 历史计算 `implementationCommit..HEAD`。Evidence 工作流已使用 `fetch-depth: 0`；任何后续浅克隆改动都必须由工作流结构策略阻断。
