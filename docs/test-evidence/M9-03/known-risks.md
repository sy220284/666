# M9-03当前已知风险

- AR-07将AppShell生命周期拆为六个React/DOM控制器。Node覆盖环境无法忠实执行其DOM、MessagePort和Electron生命周期，因此采用精确文件排除；纯状态模型继续纳入覆盖，且由专项行为测试、源码不变量和Electron E2E提供替代证据。具备可信浏览器/Electron覆盖环境后应逐项移除排除。
- Microsoft拼音真实组合输入只能由Windows原生门禁给出最终权威结果；本次Draft路由未执行Windows Job。AR-07未修改Writing Editor或IME协议，最终Ready矩阵仍必须执行。
- 当前证据仅证明AR-03—AR-07检查点完成，不代表AR-08—AR-14已完成，也不满足最终Ready或合并条件。
- 若AR-07出现P0回归，应整体回退到AR-06受检Head `99f124369054ab20dcf919ec89aacfd41f592152`，不得在AR-08中追补AppShell缺陷。
