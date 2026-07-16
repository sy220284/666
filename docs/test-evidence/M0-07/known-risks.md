# 已知风险

- CI 使用确定性 Provider Stub，只验证协议、Schema、故障与降级，不代表任何真实 Provider 或模型质量已达到生产基线。
- 大于 20000 字的策略已冻结为 Worker；M0-07 只返回可执行计划，真实 Worker 适配器在 M2/M5 Candidate 接入任务实现。
- Candidate 数据库、GenerationRun 持久化和审阅 UI 属于后续任务，M0-07 不创建占位表或伪 UI。
- 本地容器缺少 DISPLAY/xvfb-run，Electron E2E 本地跳过；相同 pnpm test 入口已在 GitHub Xvfb 远端门禁通过。
- 复杂度保护触发时字符 Diff 会退化为可重建的整段删除/插入，保留正确性与取消能力，但不保证细粒度高亮。
