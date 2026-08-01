# M9 V1.1 架构治理

本目录保存V1.0封版后、V1.5功能开发前的保持行为架构拆分任务。

## 当前状态

```text
ACTIVE
```

M8-09继续作为V1.0 `VERIFIED_HOLD`兼容锚点；M9使用`TASK_AUTHORIZATION.json`的`parallel-pr`模式和`docs/tasks/runtime/`独立机器状态。不同任务可以并行开放PR，main写入与Main Verification保持串行。

当前进度：

- M9-00：激活治理与权威文档同步，Verified。
- M9-01 / AR-01：重构安全网，Verified。
- M9-02 / AR-02：Shared Structure，Implemented，等待永久门禁与受控合并。
- M9-03—M9-14：按冻结依赖保持Planned，逐包建立任务卡后激活。

## 文档入口

1. [`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)：目标架构、不变量、实施顺序、门禁与完成定义。
2. [`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)：AR-01—AR-14工作包、范围、依赖、风险与验收标准。
3. [`M9-00_ACTIVATION_GOVERNANCE.md`](M9-00_ACTIVATION_GOVERNANCE.md)：M9激活治理与权威文档同步。
4. [`M9-01_REFACTOR_SAFETY_NET.md`](M9-01_REFACTOR_SAFETY_NET.md)：已完成的重构安全网。
5. [`M9-02_SHARED_STRUCTURE.md`](M9-02_SHARED_STRUCTURE.md)：当前Shared Structure拆分。

## 激活规则

- 每个AR工作包必须先建立独立任务卡和Runtime，再修改生产代码。
- Runtime必须声明精确依赖、允许路径、禁止路径、验证矩阵和回退边界。
- 每个PR正文必须绑定`worldforge-task`标记。
- 高风险包不得并行修改同一核心文件。
- main只接受永久门禁全部成功的受检Head；合并后必须完成Main Verification和独立Verified关闭。
