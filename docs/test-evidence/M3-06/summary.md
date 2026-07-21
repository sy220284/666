# M3-06 StateProposal 与 EndingSnapshot

实现提交：`d705e2189b8e52e3a5c3f7583dfbb4e2df96a926`

本任务建立双类型 StateProposal、作者裁决事务、EndingSnapshot 与旧章返修失效传播：

- `pending` 提案仅进入候选账本，不修改 EntityState 或 ArcMilestone。
- 接受、编辑接受与拒绝统一进入 Core；批量裁决任一失败时整批回滚。
- 接受后的权威状态与 EndingSnapshot 在同一写事务生成。
- 有效快照直接读取；快照缺失或 stale 时回退查询权威当前表。
- 纯文字润色不传播；状态、弧光、事件、时间线和伏笔变化只使后续快照及对应派生范围失效。
- 提案必须携带属于定稿 Version 的正文 logicalBlock 证据。
