# M9-03当前已知风险

- AR-04改变Renderer内部章节会话与Editor装配边界，虽然公开Props、Bridge、Schema和文案保持不变，仍需三平台Electron E2E确认真实挂载和关闭时序。
- Microsoft拼音真实组合输入只能由Windows门禁给出权威结果；本地Linux测试仅覆盖状态机、Autosave暂停/恢复协议和源码不变量。
- 当前证据是统一任务的阶段证据，不代表AR-05—AR-14已完成，也不满足最终Ready或合并条件。
- 若AR-04远端门禁失败，必须回退`f7e17c1`到AR-03基线`d2e5893`，不得在AR-05中追补。
