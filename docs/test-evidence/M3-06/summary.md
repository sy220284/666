# M3-06 StateProposal、EndingSnapshot 与有限期状态修复

权威实现提交：`01409dd483191764fbc05d5bb298a33f5b32f360`
实现PR Head：`ffee00fdd68bf467c3f712418d473c02fda9f622`
原始功能主线提交：`bba007a6735a65f1af6bdc0f06a278ddebe16fb4`

最终Quality运行：`29807742042`，Static、Unit、Integration、Migration、Build、Electron E2E全部成功。
独立永久门：PR Policy `29807741925`、Task Governance `29807741957`、Evidence `29807741913`、Security `29807741863`、Performance `29807741889`均成功。

本次审计复验确认并修复：

- `validUntilChapterId`从合同、StateProposal账本、作者接受/编辑接受到`entity_states.valid_until_chapter_id`完整保留。
- 非空结束章节必须属于同项目、保持活动状态并严格位于起始章节之后。
- EntityState继续采用`[validFromChapterId, validUntilChapterId)`半开区间。
- 覆盖非空终点、同章、逆序、跨项目、编辑接受、终点失效后的批量事务回滚。
- 真实Electron链路验证有限期提案经IPC、Core与作者界面接受后，在结束章节起失效。
- pending提案不修改权威状态；接受、编辑接受、拒绝与EndingSnapshot重建保持单事务。
- 快照缺失或stale时回退权威当前表；纯文字修订不触发语义传播。

人工复核结论：PR最终差异不含一次性`expect.fail(...)`诊断文件；数据库、合同、Core、Electron链路与冻结文档语义一致。

结论：M3-06审计缺陷已修复并通过完整PR矩阵，登记为Implemented；最终Verified按M3批次复验规则延期。
