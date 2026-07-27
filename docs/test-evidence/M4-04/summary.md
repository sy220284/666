# M4-04 Evidence Summary

## 当前阶段

整体基线审计与编码前实施规划已经完成。C1—C7 作者工作流、GenerationRun、
T0/T1、改写、融合、Candidate 审阅、状态提取、Validation、搜索、安全替换、
人工写作统计、节奏、DOCX 与三轨备份恢复闭环已实现。C8 尚未开始实施，后续继续
使用任务卡“第六阶段：完整体验、硬化与发布关闭”的原始整体规划。

## 本阶段交付

- M4-04任务卡四项执行附件完成。
- 28项剩余需求已映射到用户路径、代码模块、测试和P0。
- Project Schema 21后的Migration序列、IPC及共享合同方案冻结。
- 正式分支继续使用`work/m4-04-v1-integrated-delivery`。
- Schema 22、ProjectContinuation Core服务及完整Main/Preload/Renderer入口完成。
- 首页继续写作、编辑器重启恢复、侧栏折叠、沉浸写作和中文实体类型表单完成。
- 既有拆章、并章、跨章移动可视化预览继续复用`planHash`、LockGuard、事务和恢复点。
- Schema 23、GenerationRun、ModelSupportProfile、类型化结果引用和独立Generation IPC完成。
- 六类生产Prompt完成；直接章节目标到正文Candidate的真实Provider纵向路径完成。
- 取消、迟到增量隔离、partial显式保存或丢弃、重启恢复和结果原子提交完成。
- Schema 24、Skeleton修订、生成输入来源和Candidate来源映射完成。
- T0多Skeleton与T1 Skeleton/SceneBeat/直接目标三种互斥来源完成。
- 快速/结构性改写使用Revision、块Hash、范围与文本Hash权威锚点。
- Beat/Segment双模式融合、重复/重叠/过期来源拒绝和完整追溯完成。
- Candidate工作台接入真实进度、取消、partial裁决、继续生成、手动补全、
  来源追溯、差异、冲突、采用和整体撤销。
- Skeleton与Prose在合同、存储和Core Preview/Apply边界保持硬隔离。
- Schema 25、StateProposalBatch、ValidationBatch、ValidationIssue、
  StoryTodo与StoryComment完成。
- 状态提取与AI语义检查接入真实Provider Runtime，只读取当前Final Version，
  并与GenerationRun结果引用原子提交。
- Provider提案保持pending；作者裁决前不改变实体状态、人物弧光或Draft。
- 确定性规则检查具备规则/配置版本、输入幂等、稳定ID和Version/Block Hash锚点。
- 检查工作台及状态提案工作台已接入规则/AI运行、证据、问题动作、待办、批注和裁决。
- Schema 26、七值`mutationOrigin`、ReplacePlan、GenreRhythmProfile与WritingSession完成。
- 全项目搜索覆盖活动Draft、只读Version和Entity，继续复用M4-01索引、
  权威回读、索引状态与项目词典。
- 安全替换只修改活动DraftBlock，提交前复核Revision、块Hash、范围、命中文本
  和LockGuard，并在单事务前创建Recovery Checkpoint。
- 人工作字数和有效写作速度只统计Core标记的`manual_edit`，排除Candidate采用、
  导入、替换、结构、恢复和系统维护。
- 爽点密度、章末钩子、黄金三章与连载目标为透明、可配置、可关闭的P3建议。
- DOCX导入在进入既有ImportPlan前执行ZIP中央目录、解压预算、路径、
  内容类型、XML与Relationship安全检查，拒绝宏、OLE、ActiveX、外部链接
  和归档炸弹。
- TXT、Markdown与DOCX导出只读取作者明确选择的不可变Version，并以
  排他临时文件、`fsync`、重新校验和原子重命名提交。
- DOCX导入保留计划失效、恢复点和单事务语义，写入标准
  `mutationOrigin=import`审计且不污染人工写作统计。
- Schema 27与既有RecoveryService建立日常滚动、重大操作、命名快照三轨；
  支持策略、空间配额、确定性清理预览、stale拒绝和失败补偿。
- 作者保护、关键Migration点和最后一份已验证备份不会被自动清理；
  解除作者保护要求精确备份ID确认，恢复始终创建新项目副本。

## C0—C7 基线复核

受检产品提交：`3b8cae9d42dd06c5862606b1c23afef50cd0fa9d`。

本轮复核修复：

- `@worldforge/core-service`已在模块边界策略中正式允许依赖`@worldforge/prompts`，
  并增加单元测试锁定该依赖方向。
- `typecheck`与`test:prepare`已调整为先构建Prompts、再构建Core，消除干净工作区
  依赖产物缺失风险。
- DOCX证据表述已收窄到代码真实验证范围：本地Header签名与偏移、中央目录声明、
  解压后大小、路径和归档预算；完整本地Header字段交叉校验继续纳入C8安全硬化。

## 当前结论

现有M0—M3与M4-01—M4-03底座保持兼容。C1—C7产品代码与历史阶段回归证据有效；
本轮修复没有改变产品数据模型、Migration、IPC或用户行为。长期PR保持Draft，
C8尚未开始实施。

## 已执行校验

历史阶段校验：

- Unit：54个测试文件、456项测试全部通过。
- C1全量Unit、Integration、Migration：120个测试文件、630项全部通过。
- C2全量Unit、Integration、Migration、Security：150个测试文件、730项通过、1项跳过。
- C3—C4 Unit、Integration、Migration、Security：154个测试文件、739项通过、1项跳过。
- C3—C4 AI Eval：2个测试文件、8项通过；Performance：10个测试文件、37项通过。
- C5 Unit、Integration、Migration、Security：157个测试文件、744项通过、1项跳过。
- C6 Unit、Integration、Migration、Security：160个测试文件、749项通过、1项跳过。
- C6 Performance：10个测试文件、37项全部通过。
- C7 Unit、Integration、Migration、Security：165个测试文件、757项通过、1项既有跳过。
- C7 DOCX、三轨恢复、Migration与IPC安全定向回归：5个测试文件、7项全部通过。

当前受检提交的GitHub Actions Quality #2043：

- 活动任务与镜像校验通过。
- `pnpm check:workspaces`通过。
- `pnpm check:boundaries`通过。
- `pnpm format:check`通过。
- `pnpm lint`通过。
- `pnpm typecheck`通过。
- 静态检查前后工作树保持干净。
- PR保持Draft，Quality工作流按永久规则只执行静态门；Unit、Integration、
  Migration、Coverage、Build和Electron E2E在本次Draft运行中按设计跳过，
  不在本轮Evidence中冒充当前Head的新增通过结论。
