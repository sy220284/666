# M11-01 已知风险与边界

- M11-01 只完成中文作者语境基线与第一批高频交互减负；统一 ReviewProposal、定稿后自动 AI 分析、人物关系持久化、时间线/人物关系/伏笔可视化、灵感胶囊、文风档案和长期摘要仍由后续 M11 任务承接。
- 本任务没有数据库 Migration；内部类型、IPC、数据库标识与 StateProposal 权威语义保持兼容。未知复杂结构仍采用安全只读编辑保护，避免为了“无 JSON”强行损坏结构化数据。
- 完整拖拽重排仍未进入本任务；拆章、跨章移段、场景关联和知情来源采用正文段落可视选择，并继续依赖现有预览、锁定、 planHash 与恢复点安全链。
- GitHub Hosted Runner 的性能与桌面测试仍可能受共享运行环境噪声影响；本轮冻结提交的 Quality / Security / Performance / Full Work 均已成功，性能预算没有放宽。
- 离线工具 Artifact 保留 pnpm 11 默认供应链校验。由于 `pnpm@11.21.0` 在冻结验证时距离默认 24 小时 minimum release age 尚不足约 72 分钟，导出器仅对 authority 精确锁定的这一版本使用官方 `minimumReleaseAgeExclude` 配置；其余 88 个 registry 包仍接受完整供应链年龄验证。
- Stable 正式发行仍需要真实 Windows Authenticode 与 macOS Developer ID / notarization / stapling 凭据；缺少凭据时发行门禁继续 fail-closed。
- Schema 2 的 `IMPLEMENTED` 不是最终 Verified。PR #346 合并后仍必须由来源主线提交上的 `task-verification/M11-01=success` 与 `main-verification=success` 完成有效状态闭环。
