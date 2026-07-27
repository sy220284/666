# C5 状态提取、Validation 与连续性检查点

## 结论

C5已完成真实Provider状态提取、批次化作者裁决、确定性规则检查、AI语义检查以及StoryTodo/Comment闭环。状态提案与检查结果均只读取当前Final Version；Provider输出不能直接修改Draft、实体状态或叙事规划权威数据。

当前验收状态为部分通过：功能链和现有自动化通过，但Schema 27历史脏锚点升级到Schema 28时缺少检测、拒绝、只读保护、隔离或确定性修复策略，也缺少对应历史脏数据Migration Fixture。该缺口未关闭前，C5不得标记为`Verified`。

## 实现

- Schema 25新增`state_proposal_batches`、`validation_batches`、`validation_issues`、`story_todos`与`story_comments`严格表。
- `generation_input_sources`增加不可变`version`来源，`generation_result_refs`增加`state_proposal_batch`与`validation_batch`。
- Migration为Final Version、项目、章节、GenerationRun、批次、问题锚点和结果引用增加数据库级所有权触发器；跨项目或错误Run类型不能落库。
- `state_extract`使用生产Prompt、约束包、当前Final Version块和现有Provider Runtime；结果与Run成功状态、批次及结果引用在同一事务提交。
- Provider状态提案保留Core当前权威值为`previousValue`，初始状态固定为`pending`；接受、编辑后接受或拒绝仍要求明确作者命令。
- 确定性检查记录规则版本、配置版本、输入指纹、稳定问题ID、Version/Block Hash、引文和范围锚点；相同输入重复运行不生成重复批次。
- 规则覆盖空块、重复标点、长段落、长句均值、对话比例和必选SceneBeat覆盖。
- `validate`使用同一GenerationRun、ConstraintPackage与Provider Runtime，只把Final Version块及接受/编辑后的权威约束作为上下文。
- AI问题必须引用允许的证据ID；块引文必须在对应不可变VersionBlock中命中。
- 检查工作台支持规则/AI运行、证据展开、解决、忽略、静音、降级、误报、重新打开、转待办、批注与批注解决。
- 状态提案工作台支持从有Final Version的章节选择真实Provider发起提取，展示批次、Run、原值、建议值、证据与作者裁决。

## C0—C7复核硬化

- Schema 28追加`story_todos`与`story_comments`复合锚点触发器，不修改历史Schema 25。
- StoryTodo的SceneBeat必须属于同一项目和章节；正文块必须属于该章活动Draft，或与所关联的历史ValidationIssue锚点一致。
- StoryComment的Version必须属于同一项目和章节；正文块必须属于所选Version、当前活动Draft，或与所关联的历史ValidationIssue锚点一致。
- INSERT和UPDATE均执行同一复合范围校验，防止先写合法记录再通过更新绕过。
- 新增同章正常路径、跨章正文块、跨章Version、跨Version正文块及更新绕过回归。
- 当前项目Schema最新版本为28。
- 现有Migration只对未来INSERT/UPDATE生效，尚未处理Schema 27数据库中已经存在的非法历史锚点；这是当前C5验收阻断项。

## 历史阶段测试

- Schema 25严格表、Version输入类型、结果类型及所有权触发器。
- Provider状态批次、Core原值、非权威pending、Run/结果引用原子提交。
- 确定性规则输入幂等、稳定问题ID、规则/配置版本和锚点状态。
- AI语义批次证据白名单、Final Version块锚点和GenerationRun结果引用。
- Issue动作、Todo、Comment与跨项目验证。
- 七个Validation IPC命令的严格Envelope、受信Renderer URL和多余字段拒绝。
- Unit、Integration、Migration、Security合并回归：157个测试文件、744项通过、1项跳过。
- 全工作区Build、Typecheck、ESLint与Prettier通过。

## 当前验证结论

最近一次完整产品矩阵为提交`f36ca0c0567130ab7072c6da3d0ed402dd1fda2d`上的Quality #2186、Security #1976与Performance #1942。Schema 28现有Migration、Integration、Security、Coverage和Electron E2E均在当前测试集合内成功。

该CI成功只证明现有测试集合通过，不能覆盖尚未编写的Schema 27历史脏数据升级场景。C5继续保持部分通过，待补充升级策略、历史Fixture和失败不半升级回归后复验。

## 后续边界

C6在同一检查工作台接入全项目搜索、安全替换、写作统计与节奏视图，不建立第二套搜索结果或问题权威模型。真实第三方Provider的账号、限流与模型差异继续由C8发布环境Eval和人工验收覆盖。
