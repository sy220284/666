# M4-04 Known Risks

1. 单一任务吸收20张原任务，必须依靠内部检查点和原子提交控制跨层断裂。
2. GenerationRun、结构化Candidate和StateProposalBatch需要连续Migration，表重建风险高。
3. `ModelSupportProfile`存在`untested/unverified`历史命名冲突，必须兼容读取后统一新写入。
4. 长期Draft PR会持续变化，最终Evidence必须重新绑定Ready前最终Head。
5. DOCX、超大项目、混合DPI和跨平台安装验收需要真实环境与可复现工件。
6. C1已加入继续写作持久化；后续Migration必须保留Schema 22读取兼容并继续只追加。
7. 当前容器缺少X Server，C1 Electron Playwright在Renderer启动前退出；必须读取PR CI结果后再确认桌面路径。
8. C6—C8尚未完成，追踪矩阵中的M4-04需求继续保持`In Progress`。
9. 当前容器只能通过 Core/Renderer 自动化验证 C3—C4；真实 Electron
   Candidate 工作台仍需由 PR CI 与 C8 人工 UI 矩阵复核。
10. `generation_result_refs`已预留`state_proposal_batch`类型，其目标表与强外键将在
    C5 的 Schema 25 追加；C3—C4 没有提前写入该类型。
11. 结构化正文模式中断时只有完整可解析结果才可成为 complete Candidate；纯文本模式
    继续承担可读 partial 的主要路径，最终模型档案需要在 C8 真实 Provider Eval 复核。
12. C5 已覆盖 Provider Runtime 接线、原子持久化和证据边界，但当前容器不保存真实
    第三方账号；限流、账号权限和模型输出差异仍需在 C8 发布环境复核。
