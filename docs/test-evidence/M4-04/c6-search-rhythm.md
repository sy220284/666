# C6 搜索、安全替换、写作统计与节奏检查点

## 结论

C6已完成Draft、不可变Version与Entity的全项目搜索，建立只修改活动DraftBlock的ReplacePlan安全替换闭环，并把写作统计限定为Core判定的`manual_edit`。节奏、章末钩子、黄金三章和连载指标均为可关闭、可配置、不阻断写作或生成的P3建议。

## 实现

- Schema 26为`draft_patch_log`增加七值`mutation_origin`，新增`replace_plans`、`replace_plan_items`、`genre_rhythm_profiles`与`writing_sessions`严格表及项目/章节所有权约束。
- 搜索复用M4-01的FTS、补充召回、权威回读、索引状态和项目词典。
- ReplacePlan由Core权威生成并持久化，只包含活动DraftBlock的精确命中。
- 提交时重新验证项目、计划状态、Draft Revision、块Hash、范围和命中文本。
- 替换提交先创建Recovery Checkpoint，再在单一数据库事务内更新Draft、Revision和标准Patch审计记录；任何过期项使整批计划变为stale。
- Version保持不可变，Entity修改继续使用专用设定命令。
- Renderer不能传入`mutationOrigin`。
- 写作会话只由人工Patch产生；AI采用、导入、替换、结构、恢复和系统维护不进入人工统计。
- GenreRhythmProfile支持频道、爽点密度范围、章末钩子、黄金三章、每日目标、空闲阈值和时区配置；关闭后不输出节奏建议。

## 测试

- Schema 26严格表、七值来源约束、索引、作用域触发器与级联删除。
- Draft/Version/Entity搜索、活动Draft精确替换、锁定跳过、Version不变、恢复点、事务提交和过期计划拒绝。
- `manual_edit`与`safe_replace`审计来源及安全替换不计入人工写作统计。
- 节奏阈值、黄金三章、章末钩子、P3严重级别、作者配置和关闭后零建议。
- 搜索/节奏IPC严格Envelope、受信Renderer URL、多余字段和伪造`mutationOrigin`拒绝。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198、Security #1988和Performance #1954全部成功。搜索、安全替换、写作统计、节奏、性能预算和Electron E2E均通过。

C6验收通过。

## 后续边界

C7在现有CoordinatedImportExportService、ImportPlan与RecoveryService上完成DOCX安全导入、多格式导出与三轨恢复中心。搜索索引仍为派生数据，恢复后通过既有流程重建。
