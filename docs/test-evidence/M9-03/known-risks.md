# M9-03当前已知风险

- AR-07的六个React/DOM生命周期控制器继续采用精确覆盖排除；纯状态模型、行为测试、源码不变量和Electron E2E提供替代证据。具备可信浏览器/Electron覆盖环境后应逐项移除排除。
- AR-08保持公开运行时表面和类型表面精确一致，但后续AR-09、AR-10会迁移Preload与Main调用装配；每个检查点仍必须重新执行公开表面、IPC安全和Electron E2E验证。
- Microsoft拼音真实组合输入只能由Windows原生门禁给出最终权威结果；本次Draft路由未执行Windows Job。最终Ready矩阵仍必须执行。
- 当前证据仅证明AR-03—AR-08检查点完成，不代表AR-09—AR-14已完成，也不满足最终Ready或合并条件。
- 若AR-08出现P0兼容回归，应整体回退到AR-07受检Head `18558ef8088cac6553609b0ffd3c5f3abe52468c`，不得在AR-09中追补Contracts缺陷。
