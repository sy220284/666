# M10-13 1.5前置边界重构与根因治理 Evidence

## 结论

M10-13 已完成1.5前置边界治理：成熟的数据、事务与业务内核保持原状，脆弱的进程通信、异步操作承载和Renderer命令生命周期被收敛为统一公共机制。后续同类问题统一从状态所有权、通信边界、错误模型和生命周期根因处理，禁止在多个调用点复制补丁。

## 受检实现

- 实现提交：`10d364a8b5b8e415966cf7d55e6cb4f02d647c2a`
- 来源 PR：`#321`
- 指导原则：`AGENTS.md` 已加入“保留成熟内核、局部重写脆弱边界、统一机制消灭问题类别”的强制处理顺序，并由治理测试锁定。
- Core RPC：等待者绑定精确请求身份；单条响应只消费一个等待者；发送失败、超时、进程退出和Shutdown失败统一清理。
- Utility：异步执行、结构化结果、安全发送和Drain登记进入同一Tracked Operation机制，拒绝与发送失败均被消费并可观测。
- Renderer：Command Coordinator统一`replace`、`join`、`reject`并发策略，Pending与结果提交由Token所有权控制；项目、Candidate与Provider关键链路已迁移。
- Provider：刷新、互斥命令和范围标签从TSX抽离为单一可测试控制层，作者错误摘要不泄漏底层消息。
- Recovery：可写数据库概览先验证关键表可读；明确的只读恢复模式继续使用外部检查点，不把数据库故障伪装为空列表。
- 契约与诊断：重复Rewrite Block在受信IPC边界拒绝；自动保存异常提供作者可见状态；隐私日志为Best Effort，不能改变业务成功结果。
- 保留内核：SQLite、Migration、单写队列、GenerationRun持久化、Provider DNS Pinning、Credential Broker、Recovery Journal与Electron安全壳均未重写。

## 验证事实

- Task Governance、PR Policy、Security与Performance永久检查成功。
- Workspace、Boundaries、Format、Lint、Typecheck和静态聚合Quality成功。
- Unit：162个测试文件、867项测试全部成功。
- Integration：63个测试文件、174项测试全部成功。
- Migration：27个测试文件、52项测试全部成功。
- Coverage永久门禁成功，阈值未降低：行73.77%、语句71.74%、函数65.50%、分支59.69%。
- Electron E2E完成33项桌面主链验证，Build与Quality聚合门禁成功。
- 产品测试与Coverage Artifact绑定实现提交；Electron E2E Artifact绑定同一实现提交。
- 实现提交之后仅包含当前任务卡、Runtime、任务索引和M10-13 Evidence收口文件。

## 验收

Evidence manifest 使用Schema 2，绑定完整实现提交`10d364a8b5b8e415966cf7d55e6cb4f02d647c2a`。合并后的最终主线状态由`main-verification`和`task-verification/M10-13`给出。
