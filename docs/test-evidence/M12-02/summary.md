# M12-02 验证摘要

- 任务：M12-02 项目资产生命周期与研究资料库
- 来源 PR：#399 (`work → main`)
- 实现冻结提交：`1370043776250a15ce531be4c87bff77d502d465`
- 结论：实现提交已完成静态检查、产品测试与覆盖率、可靠性、安全、性能、Electron E2E、Linux/Windows/macOS 平台体验验证；闭包提交仅更新本目录 Evidence。
- Product：397/397 测试文件、1583/1583 用例通过；coverage gate 通过。
- Project Artifact Set：`project.sqlite + managed attachments`，附件通过稳定相对路径、SHA-256、大小、媒体类型与 identity 纳入备份/恢复/移动/克隆。
- Research：Note / Attachment / Link 本地持久化，接入既有 SearchTools/FTS 与 AuthorNavigationTarget，不建立第二搜索权威。
- AI：研究资料默认不进入生成上下文；只有作者显式选择的 Research ID/Attachment ID 才形成单次 GenerationRun 快照并注入 Provider 请求，且不提升为 Canon / Continuity / Planning 权威事实。
- UI：ResearchWorkbench 支持笔记、标签、来源、受管附件、安全预览、关联跳转、只读与显式智能参考。
- Visual：四主题采样改为状态规范化、双 `requestAnimationFrame` 与连续两张 PNG 字节一致后才接受；旧三张中间帧基线经两次独立 Actions 收敛见证后受控替换，最终实现提交再次执行完整 Desktop E2E 并通过。
