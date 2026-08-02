# M9 V1.1 架构治理

本目录保存V1.0封版后、V1.5功能开发前的保持行为架构拆分任务。

## 当前状态

```text
VERIFIED_HOLD
```

M9-00—M9-03全部Verified。M9-03统一承接的AR-03—AR-14全部完成；M9-04—M9-14继续保持Removed（absorbed by M9-03），其冻结需求、测试和验收均已由M9-03闭环。

最终结果：

- M9-00：激活治理与权威文档同步，Verified。
- M9-01 / AR-01：重构安全网，Verified。
- M9-02 / AR-02：Shared Structure，Verified。
- M9-03 / AR-03—AR-14：保持行为架构拆分、Legacy退役、CSS分层和结构预算收敛，Verified。
- 实施PR #273合并为main提交`f5add56154e99bc907376e08787b7037851835f0`；Main Verification运行`30754708770`成功。
- 验证PR #289完成Windows原生微软拼音和三平台Package Smoke，关闭且未合并。

## 文档入口

1. [`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)：目标架构、不变量、实施顺序、门禁与完成定义。
2. [`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)：AR-01—AR-14工作包、范围、依赖、风险与验收标准。
3. [`M9-00_ACTIVATION_GOVERNANCE.md`](M9-00_ACTIVATION_GOVERNANCE.md)：M9激活治理与权威文档同步。
4. [`M9-01_REFACTOR_SAFETY_NET.md`](M9-01_REFACTOR_SAFETY_NET.md)：已验证的重构安全网。
5. [`M9-02_SHARED_STRUCTURE.md`](M9-02_SHARED_STRUCTURE.md)：已验证的Shared Structure拆分。
6. [`M9-03_WRITING_TOOLS_DISPLAY.md`](M9-03_WRITING_TOOLS_DISPLAY.md)：已验证的AR-03—AR-14统一执行任务。

## 终态规则

- M9-03是AR-03—AR-14唯一正式任务，M9-04—M9-14不恢复独立任务状态。
- 所有公开协议、数据库Schema、错误码、持久化格式和作者裁决语义继续受回归门禁保护。
- 后续功能阶段必须从已验证的main基线建立新任务，不得在M9实施分支上继续叠加。
