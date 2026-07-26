# M4-04 Known Risks

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate和StateProposalBatch需要连续Migration，表重建风险高。
3. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
4. 长期Draft PR会持续变化，最终Evidence必须重新绑定Ready前最终Head。
5. DOCX、超大项目、混合DPI和跨平台安装验收需要真实环境与可复现工件。
6. C1已加入继续写作持久化；后续Migration必须保留Schema 22读取兼容并继续只追加。
7. 当前容器缺少X Server，C1 Electron Playwright在Renderer启动前退出；必须读取PR CI结果后再确认桌面路径。
8. C3—C8尚未完成，追踪矩阵中的M4-04需求继续保持`In Progress`。
9. C2只开放直接章节目标的正文生成入口；T0、骨架或场景节拍驱动的T1、改写、融合必须在C3完成后才可验收。
10. `generation_result_refs`已预留`state_proposal_batch`类型，其目标表与强外键在C4的Schema 25追加，C2不得提前写入该类型。
