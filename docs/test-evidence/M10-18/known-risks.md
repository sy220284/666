# M10-18 已知风险与回退边界

1. Import 高层幂等缓存是进程内有界结果缓存；跨进程重启后的长期持久幂等仍由既有 Project SQLite request journal 负责。本任务不新增第二套持久化 request 表。
2. Import 失败 Promise 会按现有 `BoundedIdempotentPromiseCache` 语义移除，因此外部条件修复后可以用同一 requestId 重试；失败前已经创建的 Recovery checkpoint属于真实失败操作的安全恢复证据，不应删除。
3. Entity Preview 只提供作者确认前的可见提示；最终能否删除必须以同一 `writeProject` 事务内重新计算的 blockers 为准。后续增加新的 `entities` RESTRICT 独立领域引用时，必须同步纳入该事务内判定。
4. Canon Fact、Entity State、Knowledge State 等 Entity 自有从属表继续使用既有 CASCADE；禁止为了“引用完整”把这些从属数据误改成 permanent-delete blocker。
5. Arc Timeline dependency 的“满足”语义以 active Event + chapter anchor + Event chapter 不晚于实际 hit chapter为边界；本任务没有引入 Timeline Event occurred/completed 第二状态机。
6. Catalog 在没有 reference chapter 时无法判断“事件是否晚于当前章”，因此只报告 archived/unanchored 等无须章节参照即可确定的 blocker；`hit` transition 始终使用 actualChapterId 做最终权威裁决。
7. 回滚应整体回退 M10-18 产品实现与专项 Integration；不得回滚 M10-17、历史 Migration、历史 Evidence 或为绕开 FK 关闭 foreign_keys。
