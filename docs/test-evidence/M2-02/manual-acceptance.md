# M2-02 人工验收记录

| 验收点 | 结果 | 说明 |
| --- | --- | --- |
| Candidate与Draft隔离 | PASS | 预览明确标注只读，候选内容不写入当前正文。 |
| 候选差异预览 | PASS | 当前已保存稿与候选稿并列显示，结构差异与字符统计可见。 |
| 丢弃候选 | PASS | 状态变为discarded，采用入口禁用，Draft保持不变。 |
| Version不可变 | PASS | 定稿Version在后续Draft变化后内容与Hash保持。 |
| 重启与归属保护 | PASS | Candidate、Version来源和项目归属跨重启保持。 |

截图与自动化断言交叉复核一致。结论：Verified。
