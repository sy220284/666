# C2 GenerationRun 与生产 Prompt 检查点

## 交付结论

C2已完成生成运行时的共享底座，并保持后续检查点的职责边界：

- Project Schema 23新增`generation_runs`、`generation_constraint_packages`、`generation_result_refs`、`generation_partial_buffers`与`model_support_profiles`。
- 六类生产Prompt使用稳定ID和严格输入、输出Schema，覆盖骨架、正文、改写、融合、语义校验和状态提取。
- `TaskProtocol`使用带类型的结果引用，同时保留历史`candidateIds`兼容读取。
- GenerationRun记录阶段、用量、取消、失败、结果和partial决策；完成结果与Candidate在同一事务内提交。
- 运行中取消会中止Provider，请求取消后的迟到增量不会显示或持久化。
- 进程中断后的纯文本正文输出可进入待用户保存或丢弃的partial缓冲；结构化JSON片段不会被降级保存为正文Candidate。
- Main只向Core临时传递按Provider归属解析的凭据；Preload仅暴露命名生成API，日志不记录Prompt、正文、响应体或凭据。

## 当前产品入口

C2开放“直接章节目标→正文候选”的真实Provider运行路径，用于验证完整的Prompt、约束包、流式任务、取消、partial和原子结果链。T0多骨架、由骨架或场景节拍进入T1、改写、融合及完整候选审阅属于C3；状态提取和规则、AI语义校验属于C5。未开放的意图返回稳定的不支持错误，不伪造成功结果。

## 数据与恢复边界

Prompt正文、Provider原始响应和凭据不写入`generation_runs`。约束包仅保存可审计的引用与哈希；结果使用类型化引用指向Candidate、StateProposalBatch或ValidationBatch。运行结果提交失败时不留下孤儿Candidate或结果引用，运行保持可恢复状态。

## C0—C7复核修复

- 修复结构化任务中断后把未解析JSON片段暴露为可保存正文partial的问题。
- 运行时现仅允许`outputMode=text`的可读正文片段进入partial缓冲。
- 新增结构化断流回归，要求Run失败且`partialStatus=unavailable`，保存操作返回`GENERATION_PARTIAL_UNAVAILABLE`。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198、Security #1988和Performance #1954全部成功。GenerationRun原子提交、取消迟到增量、纯文本partial保存/丢弃、结构化partial拒绝、重启恢复、Generation IPC来源校验与安全日志均在完整矩阵内通过。

C2验收通过。

## 后续入口

C3从Schema 24开始加入Skeleton/Prose结构化候选、T0/T1、改写、融合、候选审阅与采用体验。Schema 22—23和已公开生成合同保持向后兼容，只允许追加演进。
