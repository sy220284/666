# M4-04 Evidence Summary

## 当前阶段

M4-04的交付边界已经按作者最新指令收敛为C0—C7与C1继续写作并发硬化；该范围已完成产品实现和自动化验收，当前进入Implementation Hold。C8完整体验、硬化、真实平台验收与发布关闭由独立任务`M8-02`承接并保持Planned。

- M4-04产品实现提交：`42d7a682e3e1a26942fa9f4159d6123a8071350f`。
- M4-04阶段Evidence Head：`19b2238ac488ca7c656798c4211d2590e31f4430`。
- M4-04产品首次进入main的合并提交：`e7168bb2bbb4f02dc596d65d126dec62dd720f2c`。
- C8延期任务规划经PR #220受控合并，main提交：`2b302b4630ce1e9e5210aa93b944cef9c4525b58`。
- `M8-02`未激活，不存在有效C8实施进度。

## 已交付范围

### C1 作者工作流

- ProjectContinuation覆盖项目、章节、Draft、Revision、块锚点、光标、滚动位置和当前面板。
- 同一项目的继续写作状态串行保存，只保留最新待处理意图。
- 旧请求、迟到成功、旧失败重试和子工作台卸载闭包不得回退权威状态。
- `editor → versions → editor`最终以`editor`落库收口。
- 正式Electron E2E直接核验SQLite最终`panel=editor`，并验证关闭、重启后的正文面板恢复。

### C2—C7

- GenerationRun、生产Prompt、ModelSupportProfile和类型化结果引用完成。
- T0 Skeleton、T1 Prose、改写、融合、Candidate预览、安全采用和撤销完成。
- StateProposalBatch、ValidationBatch、StoryTodo、StoryComment及Schema 28复合锚点完成。
- Schema 27历史非法锚点在升级前被拒绝，原数据、旧Schema和恢复点保持完整。
- Draft、Version、Entity搜索、安全替换、写作统计和节奏建议完成。
- DOCX安全导入、多格式不可变Version导出与三轨备份恢复完成。

## 产品验证

C0—C7验收基线`9131a6db1f43d97e52aaa867010a316998f860fb`：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2198 | 成功 |
| Security | #1988 | 成功 |
| Performance | #1954 | 成功 |
| Evidence | #1917 | 成功 |
| PR Policy | #1946 | 成功 |
| Task Governance | #2167 | 成功 |

C1并发硬化产品提交`42d7a682e3e1a26942fa9f4159d6123a8071350f`：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2225 | 成功；Static、Unit、Integration、Migration、Coverage、Build、Package Smoke及Electron E2E 27/27通过 |
| Security | #2015 | 成功 |
| Performance | #1981 | 成功 |
| Evidence | #1944 | 成功 |
| PR Policy | #1973 | 成功 |
| Task Governance | #2194 | 成功 |

阶段Evidence Head`19b2238ac488ca7c656798c4211d2590e31f4430`：

| 工作流 | 运行编号 | 结论 |
| --- | ---: | --- |
| Quality | #2226 | 成功 |
| Security | #2016 | 成功 |
| Performance | #1982 | 成功 |
| Evidence | #1945 | 成功 |
| PR Policy | #1974 | 成功 |
| Task Governance | #2195 | 成功 |

## main与治理修复

PR #216在Ready门禁完成前被提前合并，因此合并提交`e7168bb2bbb4f02dc596d65d126dec62dd720f2c`的首次`main-verification`失败。该失败属于合并流程与任务状态不一致，不能被写成主分支通过。

后续按规范执行：

1. PR #220先将M4-04边界限定为C0—C7与C1硬化，并恢复`M8-02`为Planned C8任务。
2. PR #220 Ready模式六项永久门全部成功。
3. PR #220以`expected_head_sha`受控合并到`2b302b4630ce1e9e5210aa93b944cef9c4525b58`。
4. 该main提交的`main-verification`运行`30323690925`成功。
5. M4-04使用原正式分支提交Implementation Hold；M8-02继续保持Planned且不自动激活。

## 当前结论

- M4-04：Implemented，范围为C0—C7与C1并发硬化。
- C5历史脏锚点升级阻断：已关闭。
- C1快速回切竞态：已关闭。
- M8-02：Planned，承接C8全部延期范围。
- M4-04尚未标记Verified；最终发布、真实平台、真实Provider、完整P0与发布Evidence由M8-02完成。
