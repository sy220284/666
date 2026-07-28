# C5 状态提取、Validation 与连续性检查点

## 结论

C5已完成真实Provider状态提取、批次化作者裁决、确定性规则检查、AI语义检查以及StoryTodo/Comment闭环。状态提案与检查结果只读取当前Final Version；Provider输出不能直接修改Draft、实体状态或叙事规划权威数据。

Schema 27历史脏锚点升级阻断已经关闭，C5验收通过。

## 实现

- Schema 25新增`state_proposal_batches`、`validation_batches`、`validation_issues`、`story_todos`与`story_comments`严格表。
- `generation_input_sources`增加不可变`version`来源，`generation_result_refs`增加`state_proposal_batch`与`validation_batch`。
- Migration为Final Version、项目、章节、GenerationRun、批次、问题锚点和结果引用增加数据库级所有权触发器。
- `state_extract`使用生产Prompt、约束包、当前Final Version块和现有Provider Runtime；结果与Run成功状态、批次及结果引用在同一事务提交。
- Provider状态提案保留Core当前权威值为`previousValue`，初始状态固定为`pending`；接受、编辑后接受或拒绝要求明确作者命令。
- 确定性检查记录规则版本、配置版本、输入指纹、稳定问题ID、Version/Block Hash、引文和范围锚点。
- AI问题必须引用允许的证据ID；块引文必须在对应不可变VersionBlock中命中。
- 检查工作台支持规则/AI运行、证据展开、解决、忽略、静音、降级、误报、重新打开、转待办、批注与批注解决。

## Schema 28历史数据收口

- Schema 28的四个触发器继续保护未来StoryTodo/StoryComment的INSERT与UPDATE。
- Migration运行时在Schema 27→28前执行六类历史锚点审计：
  - Todo SceneBeat/章节范围；
  - Todo正文块/章节范围；
  - Todo ValidationIssue锚点范围；
  - Comment Version/章节范围；
  - Comment正文块/来源范围；
  - Comment ValidationIssue锚点范围。
- 发现非法历史记录时，在Migration 28 SQL执行前返回`MIGRATION_FAILED`。
- 项目以`migration-failed`只读模式打开，数据库`schema_migrations`、`projects.schema_version`和Manifest均保持27。
- Schema 28触发器不落地，非法历史记录不被静默删除或改写。
- 迁移前生成的恢复点保留，可用于人工诊断和后续确定性修复。
- 干净Schema 27数据库正常升级到28并恢复可写。

## 测试

正式Migration套件覆盖：

1. 当前Schema 28严格表、外键与十个所有权/复合锚点触发器。
2. 干净Schema 27→28成功，兼容状态为`migrated`。
3. 历史非法StoryTodo在升级前被拒绝，数据、Schema、Manifest和触发器状态均无半升级。
4. 历史非法StoryComment执行同样的拒绝与保留语义。
5. Migration恢复点真实生成。
6. Provider状态批次、Core原值、非权威pending、规则/AI校验、Todo、Comment与IPC安全回归。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198完整执行Static、Unit、Integration、Migration、Coverage、Build、Package Smoke和Electron E2E并成功。Security #1988、Performance #1954、Evidence #1917、PR Policy #1946和Task Governance #2167同步成功。

C5验收通过。

## 后续边界

真实第三方Provider账号、限流与模型差异继续由C8发布环境Eval和人工验收覆盖。
