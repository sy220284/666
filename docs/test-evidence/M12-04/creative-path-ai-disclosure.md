# 创作路径与作者信息分层

## 首页路径

- 自主创作优先显示继续写作入口。
- 人机协作优先显示章节规划与协作入口。
- 智能优先优先显示智能建议与候选审阅入口。
- 三条路径只调整首页主行动、说明和推荐顺序，仍使用 `AuthorNavigationTarget`／`writing-action` 与既有项目能力保护。
- `tests/unit/m11-home-page-interactions-coverage.test.ts` 对三条真实渲染路径分别断言主操作和推荐导航。

## AI 和候选状态

- 内部阶段映射到“等待开始、准备上下文、生成建议稿、整理结果、已完成、失败、已取消”等作者语言。
- 简明模式不显示 runId、promptId、promptVersion、provider、Revision、采用记录或输出用量。
- 完整模式保留可展开的技术详情供排查，不改变 GenerationRun、Draft、Version 或 Candidate Apply 权威。
- 候选审阅真实渲染测试同时检查简明与完整模式；Electron 长篇生成场景验证作者操作和诊断分层。
