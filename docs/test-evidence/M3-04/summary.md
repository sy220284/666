# M3-04 测试证据摘要

M3-04 建立独立的动态状态、时间线与人物知情权威账本。EntityState按章节生效并保留历史，TimelineEvent校验同一人物同一确定时间多地、依赖循环和时间顺序，KnowledgeState区分知道、相信、怀疑、误解与未知，并保存来源锚点。

自动验证覆盖Schema 13、跨项目引用、作者权限、current唯一性、历史读取、不同时间精度、地点冲突、依赖循环、知情变化和严格IPC契约。人工桌面截图、完整质量矩阵和最终Verified签字按implementation-pr模式延期。

## 验收边界

- 静态Canon继续由M3-03维护，M3-04不改变CanonFact语义。
- AI不能直接写入连续性权威表；后续M3-06通过StateProposal进入作者仲裁。
- `valid_until_chapter_id`为排他结束章节。
- `unknown`与`approximate`时间不参与确定性“同刻多地”裁决。
- PR必须通过六类永久门禁，并由Controlled Merge合并后完成Main Verification。
