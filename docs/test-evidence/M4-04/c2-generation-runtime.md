# C2 GenerationRun 与生产 Prompt 检查点

## 交付结论

C2 已完成生成运行时的共享底座，并保持后续检查点的职责边界：

- Project Schema 23 新增 `generation_runs`、`generation_constraint_packages`、`generation_result_refs`、`generation_partial_buffers` 与 `model_support_profiles`。
- 六类生产 Prompt 使用稳定 ID 和严格输入、输出 Schema，覆盖骨架、正文、改写、融合、语义校验和状态提取。
- `TaskProtocol` 使用带类型的结果引用，同时保留历史 `candidateIds` 兼容读取。
- GenerationRun 记录阶段、用量、取消、失败、结果和 partial 决策；完成结果与 Candidate 在同一事务内提交。
- 运行中取消会中止 Provider，请求取消后的迟到增量不会显示或持久化。
- 进程中断后的运行会恢复为 `interrupted`，未完成输出只进入待用户保存或丢弃的 partial 缓冲。
- Main 只向 Core 临时传递按 Provider 归属解析的凭据；Preload 仅暴露命名生成 API，日志不记录 Prompt、正文、响应体或凭据。

## 当前产品入口

C2 只开放“直接章节目标 → 正文候选”的真实 Provider 运行路径，用于验证完整的 Prompt、约束包、流式任务、取消、partial 和原子结果链。T0 多骨架、由骨架或场景节拍进入 T1、改写、融合及完整候选审阅属于 C3；状态提取和规则、AI 语义校验属于 C4。未开放的意图返回稳定的不支持错误，不伪造成功结果。

## 数据与恢复边界

Prompt 正文、Provider 原始响应和凭据不写入 `generation_runs`。约束包仅保存可审计的引用与哈希；结果使用类型化引用指向 Candidate 或后续的 StateProposalBatch。运行结果提交失败时不留下孤儿 Candidate 或结果引用，运行保持可恢复状态。

## 本地验证

- Unit、Integration、Migration、Security：150 个测试文件，730 项通过，1 项跳过，0 失败。
- TypeScript：全工作区通过。
- ESLint：全工作区通过。
- GenerationRun 原子提交、取消迟到增量、partial 保存与丢弃、重启恢复均有自动化覆盖。
- Generation IPC 的来源校验、严格合同、凭据归属和安全日志均有自动化覆盖。

## 后续入口

C3 从 Schema 24 开始加入 Skeleton/Prose 结构化候选、T0/T1、改写、融合、候选审阅与采用体验。Schema 22—23 和已公开生成合同保持向后兼容，只允许追加演进。
