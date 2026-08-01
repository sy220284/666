# M9-03当前已知风险

- AR-07的六个React/DOM生命周期控制器继续采用精确覆盖排除；纯状态模型、行为测试、源码不变量和Electron E2E提供替代证据。具备可信浏览器/Electron覆盖环境后应逐项移除排除。
- AR-09保持`window.worldforge`公开表面和Task MessagePort语义不变，但AR-10将迁移Main IPC注册边界；必须继续验证97个通道、可信来源、Schema错误、正式错误码、诊断ID和dispose后无重复监听。
- 永久`Engineering Validation / full`需要`workflow_dispatch`；当前连接器不提供创建Dispatch的能力。AR-09已用同一Head的完整PR Quality及独立Security、Performance、Evidence替代验证，AR-14终验仍必须执行永久工作流。
- Microsoft拼音真实组合输入只能由Windows原生门禁给出最终权威结果；当前Draft路由未执行Windows Job。AR-14 Ready前必须执行。
- 当前证据仅证明AR-03—AR-09检查点完成，不代表AR-10—AR-14已完成，也不满足最终Ready或合并条件。
- 若AR-09出现P0 Bridge或Task事件回归，应整体回退到AR-08受检Head `e59aa7ea5733ea0042cad09a7bff73f3834ac4b2`，不得在AR-10中追补Preload缺陷。
