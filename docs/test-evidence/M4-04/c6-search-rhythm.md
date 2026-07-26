# C6 搜索、安全替换、写作统计与节奏检查点

## 结论

C6 已完成 Draft、不可变 Version 与 Entity 的全项目搜索，建立只修改活动
DraftBlock 的 ReplacePlan 安全替换闭环，并把写作统计限定为 Core 判定的
`manual_edit`。节奏、章末钩子、黄金三章和连载指标均为可关闭、可配置、
不阻断写作或生成的 P3 建议。

## 实现

- Schema 26 为 `draft_patch_log` 增加七值 `mutation_origin`，新增
  `replace_plans`、`replace_plan_items`、`genre_rhythm_profiles` 与
  `writing_sessions` 严格表及项目/章节所有权约束。
- 搜索继续复用 M4-01 的 FTS、补充召回、权威回读、索引状态和项目词典，
  Renderer 展示 Draft、Version、Entity 来源并支持跳回正文或设定入口。
- ReplacePlan 由 Core 权威生成并持久化，只包含活动 DraftBlock 的精确命中；
  不把完整正文交给 Renderer 重新计算。
- 替换预览显示可替换项与锁定跳过项；提交时重新验证项目、计划状态、
  Draft Revision、块 Hash、范围和命中文本。
- 替换提交先创建 Recovery Checkpoint，再在单一数据库事务内更新全部 Draft、
  Revision 和标准 Patch 审计记录；任何过期项使整批计划变为 stale。
- Version 保持不可变，Entity 修改继续使用专用设定命令；批量替换不旁路
  LockGuard 或项目作用域。
- Draft 公共 IPC 始终写入 `manual_edit`；Candidate 采用、结构操作和安全替换
  分别由 Core 标记 `candidate_apply`、`structure` 与 `safe_replace`，
  Renderer 不能传入 `mutationOrigin`。
- 写作会话只由人工 Patch 产生，并按项目时区、空闲阈值和跨日边界累计净字数
  与有效秒数。AI 采用、导入、替换、结构、恢复和系统维护不进入人工统计。
- GenreRhythmProfile 支持频道、爽点密度范围、章末钩子、黄金三章、
  每日目标、空闲阈值和时区配置；关闭后不再输出任何节奏建议。
- 检查工作台接入搜索/替换/词典与节奏面板，保留既有 Validation 权威模型。

## 测试

- Schema 26、严格表、七值来源约束、索引、作用域触发器与级联删除行为。
- Draft/Version/Entity 搜索、活动 Draft 精确替换、锁定跳过、Version 不变、
  恢复点、事务提交和过期计划拒绝。
- `manual_edit` 与 `safe_replace` 审计来源及安全替换不计入人工写作统计。
- 节奏阈值、黄金三章、章末钩子、P3 严重级别、作者配置和关闭后零建议。
- 11 个搜索/节奏 IPC 命令的严格 Envelope、受信 Renderer URL、
  多余字段拒绝与 Renderer 伪造 `mutationOrigin` 拒绝。
- Unit、Integration、Migration、Security 合并回归：160 个测试文件，
  749 项通过、1 项跳过。
- Performance：10 个测试文件、37 项全部通过。
- 全工作区 Build、Typecheck、ESLint 与 Prettier 通过。

## 后续边界

C7 将在现有 CoordinatedImportExportService、ImportPlan 与 RecoveryService 上
完成 DOCX 安全导入、基于作者选择不可变 Version 的多格式导出，以及日常滚动、
重大恢复点和命名快照三轨恢复中心。搜索索引仍为派生数据，恢复后必须通过既有
重建流程回到权威 SQLite 状态。
