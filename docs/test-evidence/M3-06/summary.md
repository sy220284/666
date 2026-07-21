# M3-06 StateProposal 与 EndingSnapshot

实现来源提交：`d51ffe6a2c7751fe94dcf805a116ff0d037b5f01`
完整Quality运行：`29799141697`（Static、Unit、Integration、Migration、Build、Electron E2E全部成功）。
独立永久门：PR Policy `29799141563`、Evidence `29799141574`、Security `29799141529`、Performance `29799141539`、Repository Governance `29799141535`均成功。

本任务建立双类型StateProposal、作者裁决事务、EndingSnapshot与旧章返修失效传播：

- `pending`提案仅进入候选账本，不修改EntityState或ArcMilestone。
- 接受、编辑接受与拒绝统一进入Core；批量裁决任一失败时整批回滚。
- 接受后的权威状态与EndingSnapshot在同一写事务生成。
- 有效快照直接读取；快照缺失或stale时回退查询权威当前表。
- 纯文字润色不传播；状态、弧光、事件、时间线和伏笔变化只使后续快照及对应派生范围失效。
- 提案必须携带属于定稿Version的正文logicalBlock证据。
- 真实Electron场景完成“生成pending→作者界面接受→权威状态更新→有效尾快照展示”闭环。

结论：M3-06代码和必要专项验证已完成，状态登记为Implemented；最终Verified按M3连续实现规则延期至M3批次复验。
