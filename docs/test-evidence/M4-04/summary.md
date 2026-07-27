# M4-04 Evidence Summary

## 当前阶段

C0—C7的产品实现、第二轮代码复核和关键缺陷修复已经完成。当前验收结论为：

- C0、C1、C2、C3、C4、C6、C7通过。
- C5功能链和现有自动化通过，但Schema 27历史脏锚点升级到Schema 28的检测、拒绝、只读保护或确定性修复策略尚未补齐，因此保持部分通过。
- C0—C7整体尚未达到`Verified`，不得以CI全绿代替缺失验收场景。
- C8尚未开始，继续使用M4-04任务卡“第六阶段：完整体验、硬化与发布关闭”的原始规划。此前失效的C8重写路径和阶段进度不再作为执行依据。

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
- DOCX导入与多格式Version导出继续复用ImportPlan、恢复点、单事务和不可变Version真源。

## C0—C7复核与修复

当前Evidence绑定的产品源提交为`ea7463a40faa5b23b3b9afc97504be19f2cee708`。该提交包含C1继续写作面板切换保存失败后的重试修复，归入C0—C7收口，不代表C8已经启动。

已完成的关键修复：

1. 继续写作同时校验活动Draft、保存Revision与锚点块Hash；其他块变化后不再把旧锚点误判为`ready`。
2. 面板切换保存只在Core确认成功后提交去重状态；失败时保留可重提状态并通过既有防抖保存路径进行一次有界重试。
3. 结构化任务中断产生的未解析JSON片段不再进入可保存正文partial；纯文本正文partial语义保持不变。
4. Schema 28在数据库层约束StoryTodo/StoryComment的项目、章节、SceneBeat、Version、正文块与ValidationIssue复合锚点，并覆盖INSERT与UPDATE。
5. 生产恢复服务合并同一项目、同一UTC日期的并发日常备份请求，成功或失败后安全清理in-flight状态，跨日请求保持隔离。
6. Core→Prompts边界规则、Workspace检查与干净工作区构建顺序保持修复状态。
7. DOCX证据限定在当前真实校验范围，完整本地Header字段交叉验证、真实大文件和跨平台文件系统差异留在C8安全与发布矩阵。

## 最近一次完整CI

最近一次对完整C0—C7产品代码执行全套永久门禁的提交为`f36ca0c0567130ab7072c6da3d0ed402dd1fda2d`。该提交的七套工作流全部成功：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2186 | 成功；实际执行Static、Unit、Integration、Migration、Coverage、Build、Package Smoke与Electron E2E |
| Security | #1976 | 成功；实际执行Dependency Audit、Application Security与全Git历史Secret Scan |
| Performance | #1942 | 成功；实际执行性能预算 |
| Evidence | #1905 | 成功 |
| PR Policy | #1934 | 成功 |
| Task Governance | #2155 | 成功 |
| Repository Governance | #698 | 成功 |

上述完整CI结论适用于`f36ca0c`。当前产品源提交`ea7463a`在此后只增加C1继续写作持久化协调修复，并已执行Prettier、ESLint、TypeScript、Boundary及Unit 490/490定向验证；该提交没有对应的新一轮完整GitHub Actions运行，因此Evidence不把它描述为“当前Head全量CI已通过”。

## 当前真实结论

- C0—C4、C6—C7：验收通过。
- C5：部分通过；Schema 27历史脏锚点升级策略和相应Migration Fixture仍是进入整体验收前的阻断项。
- 当前自动化：最近一次完整产品矩阵全绿；最新C1修复完成定向验证。
- C8：尚未开始，不存在有效的C8阶段进度。
- M4-04：继续保持`In Progress`与Draft，待C5阻断项、C8、P0人工/跨平台验收及最终Evidence完成后再转Ready。
