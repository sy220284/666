# M2-01 人工验收记录

| 验收点 | 当前结果 | 说明 |
| --- | --- | --- |
| 锁定/解锁入口与可识别状态 | 自动化PASS / 人工待运行 | 桌面场景断言按钮pressed、文字、data-locked和非零边线 |
| 锁定块输入保护 | 自动化PASS / 人工待运行 | Tiptap LockGuard及桌面键入不变场景已编写 |
| Core更新、删除、移动、相邻移动保护 | 自动化PASS | 绕过Editor直接调用Core均返回DRAFT_BLOCK_LOCKED_003 |
| 批量Patch原子拒绝与摘要 | 自动化PASS | 返回冲突类型、logicalBlockId和整批跳过数量；Revision与正文不变 |
| 关闭项目再打开后的锁定持久化 | 自动化PASS | 项目数据库重开后锁定属性与Revision保持 |

本机人工桌面验收状态：`BLOCKED_BY_ENVIRONMENT`。原因：`E2E_DISPLAY_UNAVAILABLE`。不得把本文件解释为桌面验收已通过。
