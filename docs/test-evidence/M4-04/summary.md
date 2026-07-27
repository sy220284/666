# M4-04 Evidence Summary

## 当前阶段

C0—C7的产品实现、复核、阻断修复与自动化验收已经完成。

- C0、C1、C2、C3、C4、C5、C6、C7全部通过。
- C5原阻断已关闭：Schema 27历史StoryTodo/StoryComment非法锚点会在Migration 28执行前被检测；升级被拒绝时保持Schema 27、保留原数据、生成迁移恢复点，并以`migration-failed`只读模式打开，不产生半升级。
- C0—C7当前达到工程实现与自动化验收通过，尚未等同于M4-04最终`Verified`。
- C8尚未开始，继续使用M4-04任务卡“第六阶段：完整体验、硬化与发布关闭”的原始规划；失效的C8重写路径和阶段进度不再作为执行依据。

## 本阶段交付

- M4-04任务卡四项执行附件完成，28项剩余需求已映射到用户路径、代码模块、测试和P0。
- 正式分支继续使用`work/m4-04-v1-integrated-delivery`，PR #216继续保持Draft。
- Schema 22完成ProjectContinuation及Main、Preload、Renderer入口。
- Schema 23完成GenerationRun、ModelSupportProfile、类型化结果引用与独立Generation IPC。
- Schema 24完成Skeleton修订、生成输入来源、Candidate来源映射及T0/T1、改写和融合。
- Schema 25完成StateProposalBatch、ValidationBatch、ValidationIssue、StoryTodo与StoryComment。
- Schema 26完成七值`mutationOrigin`、ReplacePlan、GenreRhythmProfile与WritingSession。
- Schema 27完成日常、重大、命名三轨备份、保护、配额、清理与恢复新副本。
- Schema 28追加StoryTodo/StoryComment复合锚点硬化，不改写历史Migration。
- Migration运行时增加Schema 28前置历史锚点审计，覆盖Todo与Comment六类复合范围条件。
- DOCX导入与多格式Version导出继续复用ImportPlan、恢复点、单事务和不可变Version真源。
- main上的独立脚本、工作流与CI治理提交已通过双父合并纳入产品分支，产品树未被旧文件覆盖，分支已不再落后main。

## C0—C7收口修复

产品源提交：`9131a6db1f43d97e52aaa867010a316998f860fb`。

1. 继续写作同时校验活动Draft、保存Revision与锚点块Hash。
2. 面板切换保存只在Core确认成功后提交去重状态；失败时保持可重提，并通过既有防抖保存路径进行一次有界重试。
3. 结构化任务中断产生的未解析JSON不再进入可保存正文partial。
4. Schema 28约束StoryTodo/StoryComment的项目、章节、SceneBeat、Version、正文块与ValidationIssue复合锚点，覆盖INSERT与UPDATE。
5. Schema 27历史非法Todo或Comment在Migration 28前被拒绝，数据库和Manifest均保持27，四个Schema 28触发器不落地，迁移恢复点保留。
6. 干净Schema 27项目正常升级到28并保持可写。
7. 同一项目、同一UTC日期的并发日常备份请求被合并，成功或失败后安全清理in-flight状态。
8. main治理基线成为当前分支祖先，PR恢复可合并状态。

## 当前完整CI

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的永久门禁结果：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2198 | 成功；Static、Unit、Integration、Migration、Coverage、Build、Package Smoke、Electron E2E全部执行并通过 |
| Security | #1988 | 成功；Dependency Audit、Application Security、全Git历史Secret Scan全部通过 |
| Performance | #1954 | 成功；性能预算通过 |
| Evidence | #1917 | 成功 |
| PR Policy | #1946 | 成功 |
| Task Governance | #2167 | 成功 |

Quality #2198中，新增Schema 27历史脏数据Fixture已进入正式Migration测试并通过。首轮Quality #2197仅因`project-migration-preflight.ts`的Prettier格式失败；逻辑相关Migration、Unit、Integration、Coverage、Build和Package Smoke均已通过。格式修正后由#2198完整重放并全绿。

## 当前真实结论

- C0—C7：工程实现与自动化验收通过。
- C5历史脏锚点升级阻断：已关闭。
- C8：尚未开始，不存在有效的C8阶段进度。
- 未关闭范围：真实Provider差异、超大项目与DOCX、跨平台安装/升级/卸载、真实多屏与人工P0验收，统一进入C8。
- M4-04继续保持`In Progress`与Draft；完成C8、P0人工/跨平台验收及最终Evidence后再转Ready。
