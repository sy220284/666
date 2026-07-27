# M4-04 Evidence Summary

## 当前阶段

整体基线审计与编码前实施规划已经完成。C1—C7作者工作流、GenerationRun、T0/T1、改写、融合、Candidate审阅、状态提取、Validation、搜索、安全替换、人工写作统计、节奏、DOCX与三轨备份恢复闭环已实现。C0—C7完成第二轮全量代码复核与关键缺陷修复；C8尚未开始实施，后续继续使用任务卡“第六阶段：完整体验、硬化与发布关闭”的原始整体规划。

## 本阶段交付

- M4-04任务卡四项执行附件完成，28项剩余需求已映射到用户路径、代码模块、测试和P0。
- 正式分支继续使用`work/m4-04-v1-integrated-delivery`，PR #216继续保持Draft。
- Schema 22完成ProjectContinuation及Main/Preload/Renderer入口。
- Schema 23完成GenerationRun、ModelSupportProfile、类型化结果引用与独立Generation IPC。
- Schema 24完成Skeleton修订、生成输入来源、Candidate来源映射及T0/T1、改写和融合。
- Schema 25完成StateProposalBatch、ValidationBatch、ValidationIssue、StoryTodo与StoryComment。
- Schema 26完成七值`mutationOrigin`、ReplacePlan、GenreRhythmProfile与WritingSession。
- Schema 27完成日常、重大、命名三轨备份、保护、配额、清理与恢复新副本。
- Schema 28追加StoryTodo/StoryComment复合锚点硬化，不改写历史Migration。
- DOCX导入与多格式Version导出继续复用ImportPlan、恢复点、单事务和不可变Version真源。

## C0—C7第二轮全量复核

受检产品提交：`4f78143ca933a7e57326e32e3e86285d0bfc95c3`。

本轮已修复：

1. 继续写作读取同时校验活动Draft、保存Revision与锚点块Hash；其他块变化后不再把旧锚点误判为`ready`。
2. 结构化任务中断产生的未解析JSON片段不再进入可保存正文partial；纯文本正文partial语义保持不变。
3. Schema 28在数据库层约束StoryTodo/StoryComment的项目、章节、SceneBeat、Version、正文块与ValidationIssue复合锚点，并同时覆盖INSERT与UPDATE。
4. 生产恢复服务合并同一项目、同一UTC日期的并发日常备份请求，成功或失败后安全清理in-flight状态，跨日请求保持隔离。
5. Core→Prompts边界规则与干净工作区构建顺序保持修复状态。
6. DOCX证据继续限定在当前真实校验范围，完整本地Header字段交叉验证留在C8安全硬化。

本轮复核未发现需要修改C3/C4 Candidate硬隔离、C6安全替换事务或TaskProtocol取消/背压语义的新增阻断问题。

## 当前结论

现有M0—M3与M4-01—M4-03底座保持兼容。C1—C7产品代码已完成第二轮读取与关键问题修复，当前项目Schema最新版本为28。长期PR保持Draft，C8尚未开始实施。

## 历史阶段校验

以下为各阶段当时已经执行并记录的结果，不冒充当前Head新结果：

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

## 当前Head已执行校验

GitHub Actions Quality #2054针对`4f78143ca933a7e57326e32e3e86285d0bfc95c3`实际执行并通过：

- 活动任务与镜像校验。
- `pnpm check:workspaces`。
- `pnpm check:boundaries`。
- `pnpm format:check`。
- `pnpm lint`。
- `pnpm typecheck`。
- 静态检查前后干净工作树。

PR保持Draft，因此Unit、Integration、Migration、Security、Coverage、Build、Performance/Eval、Electron E2E与Package Smoke在该运行中按规则跳过。上述新增回归已经提交到仓库，但必须在转Ready前由完整质量路由重放，当前Evidence不把它们写成已通过。
