# M3-04人工验收记录

验收依据：PR #93最终Head、Quality运行`29722138463`、Security运行`29722138396`、Performance运行`29722138356`和Main Verification运行`29722417080`。

1. EntityState与KnowledgeState采用`[validFromChapterId, validUntilChapterId)`半开区间；旧记录已有更早结束章节时保持原终点，明确空档不会被新记录填充。
2. 旧记录无终点或与新记录发生重叠时，在同一事务中截断到新起点；同起点修订与普通历史变化具有不同账本状态。
3. 当前值、完整历史和指定章节有效值使用不同查询条件，不会把失效、被替代或区间外记录误当成当前事实。
4. `knows`、`believes`、`suspects`、`misunderstands`、`unknown`五种知情状态均可持久化并查询。
5. 可比较时间会拒绝同一在场人物以`participant`或`witness`身份出现在重叠时间的不同地点；`subject`不自动代表在场。
6. `approximate`与`unknown`不生成硬时间冲突；依赖循环和前置事件确定晚于后继事件均被拒绝。
7. AI权限无法设置、失效或归档权威连续性记录；跨项目Version、Entity、EvidenceAnchor和logicalBlock来源均被拒绝。
8. KnowledgeState使用logicalBlock来源后，即使该DraftBlock被删除，已确认记录仍可读取，且删除不会产生新的权威事实。
9. 七个具名IPC命令分别通过不可信来源拒绝、畸形负载拒绝及合法命令精确转发验证。
10. 真实Electron流程创建项目、Version、人物和地点，写入三类连续性数据，查询结果为`[1,1,1]`，连续性账本UI显示“动态状态（1）”“时间线事件（1）”“知情状态（1）”。
11. 全套验证在干净工作树上完成，最终main提交复验成功。

结论：P0-037、P0-038、P0-039对应的动态状态、时间线与知情信息通过验收。
