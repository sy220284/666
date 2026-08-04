# M10-05 已知风险

1. 历史 Evidence manifest Schema 1 继续只读兼容；新任务使用 Schema 2 的 `implementationCommit`。
2. Runtime 静态状态继续停留在 `IMPLEMENTED`，有效 Verified 由当前 main 的任务 Context 计算。
3. GitHub Commit Status 不可用或权限不足时，发布与有效状态扫描默认阻断，不回退到文档文字。
4. Work Synchronization 自动执行失败时，允许在相同 CAS 条件下手动重置，但必须复核 `main == work`。
5. Windows 微软拼音与三平台 Package Smoke 是否执行，由最终 Head 的永久路径策略决定；跳过只表示不适用。
