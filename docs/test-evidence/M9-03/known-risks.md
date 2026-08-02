# M9-03当前已知风险

- AR-07的六个React/DOM生命周期控制器继续采用精确覆盖排除；纯状态模型、行为测试、源码不变量和Electron E2E提供替代证据。具备可信浏览器/Electron覆盖环境后应逐项移除排除。
- AR-10保持正式IPC通道、来源校验、Schema拒绝、错误语义、凭据隔离与Task Listener释放不变；AR-11将迁移State Proposal与Generation内部事务边界，必须继续验证作者裁决、终局快照、派生失效、T0/T1、部分结果和模型能力降级。
- 永久`Engineering Validation / full`需要`workflow_dispatch`；当前连接器不提供创建Dispatch的能力。AR-10已用同一Head的完整PR Quality及独立Security、Performance、Evidence作为受检证据，AR-14终验仍必须执行永久工作流。
- Microsoft拼音真实组合输入只能由Windows原生门禁给出最终权威结果；当前Draft路由未执行Windows Job。AR-14 Ready前必须执行。
- 当前证据仅证明AR-03—AR-10检查点完成，不代表AR-11—AR-14已完成，也不满足最终Ready或合并条件。
- 若AR-10出现P0来源校验、正式错误语义、凭据隔离或Listener释放回归，应整体回退到AR-09受检Head `9a02b83f6fd83e45a76ed5a27e4618394422426f`，不得在AR-11中追补Main IPC缺陷。
