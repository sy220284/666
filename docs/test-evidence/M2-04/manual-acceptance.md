# M2-04 人工验收记录

| 验收点 | 当前结果 | 说明 |
| --- | --- | --- |
| 拆章预览与提交 | 自动化PASS / 人工待运行 | 预览显示移动块数、字符数与源目标变化；确认后创建恢复点并提交 |
| 并章与跨章移动 | 自动化PASS / 人工待运行 | 块顺序、logicalBlockId、Revision与PatchLog保持一致 |
| 锁定、过期与事务中断 | 自动化PASS | Core二次校验；失败时结构、正文和恢复点语义符合约束 |
| 永久删除引用检查 | 自动化PASS / 人工待运行 | Version/Candidate阻断；完整标题确认；无引用时先备份再删除 |
| 原位置与指定位置恢复 | 自动化PASS / 人工待运行 | 原位置恢复与冲突时选择目标卷/末尾均由Core确定最终位置 |
| 历史Version不可变 | 自动化PASS | 结构操作前后Version内容、Hash与来源映射不变 |

本机人工桌面验收状态：`BLOCKED_BY_ENVIRONMENT`。原因：`E2E_DISPLAY_UNAVAILABLE`。不得把本文件解释为桌面验收已通过。
