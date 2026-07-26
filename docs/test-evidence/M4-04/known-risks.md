# M4-04 Known Risks

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate和StateProposalBatch需要连续Migration，表重建风险高。
3. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
4. 长期Draft PR会持续变化，最终Evidence必须重新绑定Ready前最终Head。
5. DOCX、超大项目、混合DPI和跨平台安装验收需要真实环境与可复现工件。
6. 当前阶段只完成规划，任何产品需求均不得因本提交提前标记Implemented或Verified。
