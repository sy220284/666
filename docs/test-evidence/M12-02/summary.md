# M12-02 验证摘要

- 任务：M12-02 项目资产生命周期与研究资料库
- 来源 PR：#399 (`work → main`)
- 实现冻结提交：`46d160ee7af018acac46bd4fb4cc05ea193a6134`
- 结论：实现提交已完成静态检查、产品测试与覆盖率、可靠性、安全、性能、桌面与平台体验验证；闭包提交仅包含任务卡、Runtime、TASK_INDEX 与本目录 Evidence。
- Product：397/397 测试文件、1583/1583 用例通过；coverage gate 通过。
- Project Artifact Set：`project.sqlite + managed attachments`，附件通过稳定相对路径、SHA-256、大小、媒体类型与 identity 纳入备份/恢复/移动/克隆。
- Research：Note / Attachment / Link 本地持久化，接入既有 SearchTools/FTS 与 AuthorNavigationTarget，不建立第二搜索权威。
- AI：研究资料默认不进入生成上下文；只有作者显式选择的 Research ID/Attachment ID 才形成单次 GenerationRun 快照并注入 Provider 请求，且不提升为 Canon / Continuity / Planning 权威事实。
- UI：ResearchWorkbench 支持笔记、标签、来源、受管附件、安全预览、关联跳转、只读与显式智能参考。
