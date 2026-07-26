# C5 状态提取、Validation 与连续性检查点

## 结论

C5 已完成真实 Provider 状态提取、批次化作者裁决、确定性规则检查、AI 语义检查
以及 StoryTodo/Comment 闭环。状态提案与检查结果均只读取当前 Final Version；
Provider 输出不能直接修改 Draft、实体状态或叙事规划权威数据。

## 实现

- Schema 25 新增 `state_proposal_batches`、`validation_batches`、
  `validation_issues`、`story_todos` 与 `story_comments` 严格表。
- `generation_input_sources` 增加不可变 `version` 来源，
  `generation_result_refs` 增加 `state_proposal_batch` 与 `validation_batch`。
- Migration 为 Final Version、项目、章节、GenerationRun、批次、问题锚点和结果引用
  增加数据库级所有权触发器；跨项目或错误 Run 类型不能落库。
- `state_extract` 使用生产 Prompt、约束包、当前 Final Version 块和现有 Provider
  Runtime；结果与 Run 成功状态、批次及结果引用在同一事务提交。
- Provider 状态提案保留 Core 当前权威值为 `previousValue`，初始状态固定为
  `pending`；接受、编辑后接受或拒绝仍要求明确作者命令。
- 确定性检查记录规则版本、配置版本、输入指纹、稳定问题 ID、Version/Block Hash、
  引文和范围锚点；相同输入重复运行不生成重复批次。
- 规则覆盖空块、重复标点、长段落、长句均值、对话比例和必选 SceneBeat 覆盖。
- `validate` 使用同一 GenerationRun、ConstraintPackage 与 Provider Runtime，
  只把 Final Version 块及接受/编辑后的权威约束作为上下文。
- AI 问题必须引用允许的证据 ID；块引文必须在对应不可变 VersionBlock 中命中。
- 检查工作台支持规则/AI运行、证据展开、解决、忽略、静音、降级、误报、
  重新打开、转待办、批注与批注解决。
- 状态提案工作台支持从有 Final Version 的章节选择真实 Provider 发起提取，
  展示批次、Run、原值、建议值、证据与作者裁决。

## 测试

- Schema 25 严格表、Version 输入类型、结果类型及所有权触发器。
- Provider 状态批次、Core 原值、非权威 pending、Run/结果引用原子提交。
- 确定性规则输入幂等、稳定问题 ID、规则/配置版本和锚点状态。
- AI 语义批次证据白名单、Final Version 块锚点和 GenerationRun 结果引用。
- Issue 动作、Todo、Comment 与跨作用域验证。
- 七个 Validation IPC 命令的严格 Envelope、受信 Renderer URL 和多余字段拒绝。
- Unit、Integration、Migration、Security 合并回归：157 个测试文件、
  744 项通过、1 项跳过。
- 全工作区 Build、Typecheck、ESLint 与 Prettier 通过。

## 后续边界

C6 将在同一检查工作台接入全项目搜索、安全替换、写作统计与节奏视图；
不建立第二套搜索结果或问题权威模型。真实第三方 Provider 的账号、限流与模型差异
继续由 C8 发布环境 Eval 和人工验收覆盖。
