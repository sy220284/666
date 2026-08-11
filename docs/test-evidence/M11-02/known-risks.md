# M11-02 已知风险与边界

- M11-02 只建立统一 AI 审阅读模型、工作台、统计/筛选和现有 StateProposal 的兼容适配；人物知情、新设定、时间线、人物关系、伏笔等新增 AI 提取类型仍由 M11-03 及后续任务完成。
- 本任务没有数据库 Migration，也没有新增 IPC channel。StateProposal 继续拥有持久化、来源新鲜度和作者裁决权威语义，ReviewProposal 仅作为作者层读模型。
- 定稿后自动分析、冲突检查引擎、合理例外、时间轴/关系图/伏笔泳道等可视化均未在本任务实现。
- 当前 ReviewProposalType 第一批只有 `entity_state` 与 `arc_milestone`。后续扩类型时应继续保持 `reviewType` 与 target 判别类型一致，并优先采用显式穷举映射。
- Electron E2E 当前完整矩阵为串行 33 条，冻结验证 33/33 通过；其中 `electron-shell.spec.ts` 仍是主要耗时文件，属于测试执行效率问题，不影响本任务正确性。
- GitHub Hosted Runner 仍可能存在共享运行环境噪声；冻结 implementation commit 的 Quality / Security / Performance 均已成功，Coverage 与性能门槛没有放宽。
- Schema 2 的 `IMPLEMENTED` 不是最终 Verified。PR #349 合并后仍需来源主线提交上的 `main-verification=success` 与 `task-verification/M11-02=success` 完成状态闭环。
