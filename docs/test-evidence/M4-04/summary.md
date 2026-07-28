# M4-04 Evidence Summary

## 当前阶段

C0—C7的验收基线产品实现、复核、阻断修复与自动化验收已经完成；当前工作分支在该基线上完成C1继续写作并发硬化。

- C0、C1、C2、C3、C4、C5、C6、C7基线全部通过。
- C5原阻断已关闭：Schema 27历史StoryTodo/StoryComment非法锚点会在Migration 28执行前被检测；升级被拒绝时保持Schema 27、保留原数据、生成迁移恢复点，并以`migration-failed`只读模式打开，不产生半升级。
- C1继续写作请求已完成同项目串行、最新待处理状态合并、迟到结果隔离、父层面板意图持有和快速回切最终写入。
- C1并发硬化的可控Promise单测、完整质量矩阵及Electron跨重启用例全部通过。
- C0—C7与C1硬化达到工程实现与自动化验收通过，尚未等同于M4-04最终`Verified`。
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

验收基线产品源提交：`9131a6db1f43d97e52aaa867010a316998f860fb`。

1. 继续写作同时校验活动Draft、保存Revision与锚点块Hash。
2. 面板切换保存只在Core确认成功后提交去重状态；失败时保持可重提，并通过既有防抖保存路径进行一次有界重试。
3. 结构化任务中断产生的未解析JSON不再进入可保存正文partial。
4. Schema 28约束StoryTodo/StoryComment的项目、章节、SceneBeat、Version、正文块与ValidationIssue复合锚点，覆盖INSERT与UPDATE。
5. Schema 27历史非法Todo或Comment在Migration 28前被拒绝，数据库和Manifest均保持27，四个Schema 28触发器不落地，迁移恢复点保留。
6. 干净Schema 27项目正常升级到28并保持可写。
7. 同一项目、同一UTC日期的并发日常备份请求被合并，成功或失败后安全清理in-flight状态。
8. main治理基线成为当前分支祖先，PR恢复可合并状态。

## C1继续写作并发硬化

产品代码提交：`42d7a682e3e1a26942fa9f4159d6123a8071350f`。

1. 同一项目保存进入单通道串行执行；运行中的请求不会与后续状态并发落库。
2. 请求运行期间只保留最新待处理状态，`editor → versions → candidates`中的`versions`不会继续执行。
3. 迟到成功和旧失败重试不会回退Renderer已确认状态。
4. 写作工作台父层持有最新面板意图；子工作台因面板变化重建时，卸载保存和迟到保存都会使用父层当前面板。
5. `editor → versions → editor`快速回切以最终`editor`写入收口，确保Core最终状态与作者当前面板一致。
6. 不同项目使用独立请求通道。
7. 畸形或缺失`projectId`的请求键不进入共享回退通道。
8. 可控Promise单测覆盖执行顺序、最终Core写入、回切、项目隔离和请求分组降级。
9. 正式Electron E2E直接读取项目数据库确认最终`panel=editor`，并在关闭、重启后验证正文面板恢复。

## 当前CI

C0—C7验收基线产品源`9131a6db1f43d97e52aaa867010a316998f860fb`的永久门禁结果：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2198 | 成功；Static、Unit、Integration、Migration、Coverage、Build、Package Smoke、Electron E2E全部执行并通过 |
| Security | #1988 | 成功；Dependency Audit、Application Security、全Git历史Secret Scan全部通过 |
| Performance | #1954 | 成功；性能预算通过 |
| Evidence | #1917 | 成功 |
| PR Policy | #1946 | 成功 |
| Task Governance | #2167 | 成功 |

C1继续写作并发硬化产品提交`42d7a682e3e1a26942fa9f4159d6123a8071350f`的永久门禁结果：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2225 | 成功；Static、Unit、Integration、Migration、Coverage、Build、Package Smoke、Electron E2E 27/27全部通过 |
| Security | #2015 | 成功 |
| Performance | #1981 | 成功 |
| Evidence | #1944 | 成功 |
| PR Policy | #1973 | 成功 |
| Task Governance | #2194 | 成功 |

## 当前真实结论

- C0—C7验收基线：工程实现与自动化验收通过。
- C1继续写作并发硬化：代码、竞态单测、数据库最终状态和Electron跨重启恢复全部通过。
- C5历史脏锚点升级阻断：已关闭。
- C8：尚未开始，不存在有效的C8阶段进度。
- 未关闭范围：真实Provider差异、超大项目与DOCX、跨平台安装/升级/卸载、真实多屏与人工P0验收，统一进入C8完整验收。
- Evidence Manifest仍绑定C0—C7验收基线；最终Ready前必须重新绑定C8完成后的最终产品源。
- M4-04继续保持`In Progress`与Draft；完成C8、P0人工/跨平台验收及最终Evidence后再转Ready。
