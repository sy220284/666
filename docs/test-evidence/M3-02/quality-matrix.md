# M3-02 质量矩阵

| 维度 | 当前结论 | 依据 |
|---|---|---|
| Schema / Migration | 待永久 CI | `0011_scene_beats.sql` 与迁移测试 |
| Contracts / IPC | 待永久 CI | 全限定 `planning.sceneBeat.*` 命令、Main/Preload 白名单与安全测试 |
| Core 事务 | 待永久 CI | 创建、更新、排序、软删除、恢复、正文关联、planHash 预览与故障回滚 |
| 正文安全 | 待永久 CI | 删除节拍不删 DraftBlock；正文移动复用 M2-04 Patch/Revision/Hash/LockGuard |
| Renderer | 待永久 CI | SceneBeat 列表、编辑器、正文转换、跨章分步确认 |
| 格式 / Lint | PASS | 同步工作流执行 `pnpm format`、`pnpm lint`，退出码 0 |
| 任务状态 | PASS | `pnpm task:validate`，退出码 0 |
| 人工验收 | DEFERRED | 见 `manual-acceptance.md` |
| 截图 | DEFERRED | `screenshots/manifest.json` 当前为空数组 |
| Verified 关闭 | DEFERRED | 等待批量人工验收与最终追踪矩阵复核 |
