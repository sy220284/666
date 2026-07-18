# M2-02 人工验收记录

| 验收点 | 当前结果 | 说明 |
| --- | --- | --- |
| Candidate创建与Draft隔离 | 自动化PASS | Fixture Candidate创建前后Draft内容、Revision及块保持一致 |
| Candidate列表与只读预览 | 自动化PASS / 人工待运行 | 桌面场景验证列表、当前稿、候选稿与partial提示 |
| 丢弃候选 | 自动化PASS / 人工待运行 | 明确确认后状态变为discarded，按钮禁用，Draft不变 |
| Candidate与Version跨重启持久化 | 自动化PASS | 关闭项目并重新打开后内容、状态、来源和Hash一致 |
| Version不可变与归属保护 | 自动化PASS | Draft后续变化不影响Version；跨项目Candidate/父Version被拒绝 |

本机人工桌面验收状态：`BLOCKED_BY_ENVIRONMENT`。原因：`E2E_DISPLAY_UNAVAILABLE`。不得把本文件解释为桌面验收已通过。
