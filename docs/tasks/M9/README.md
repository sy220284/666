# M9 V1.1 架构治理

本目录保存V1.0封版后、V1.5功能开发前的保持行为架构拆分任务。

## 当前状态

```text
ACTIVE
```

M8-09继续作为V1.0 `VERIFIED_HOLD`兼容锚点；M9使用`TASK_AUTHORIZATION.json`的`parallel-pr`模式和`docs/tasks/runtime/`机器状态。作者已将M9-03及其后续任务统一执行，AR-03—AR-14只使用M9-03一个Runtime、一条正式分支和一个实施PR；main写入与Main Verification保持串行。

当前进度：

- M9-00：激活治理与权威文档同步，Verified。
- M9-01 / AR-01：重构安全网，Verified。
- M9-02 / AR-02：Shared Structure，Verified。
- M9-03 / AR-03—AR-14：V1.1剩余架构拆分统一执行，In Progress。
- M9-04—M9-14：Removed（absorbed by M9-03）；只移除独立执行形式，全部冻结要求由M9-03承接。

## 文档入口

1. [`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)：目标架构、不变量、实施顺序、门禁与完成定义。
2. [`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)：AR-01—AR-14工作包、范围、依赖、风险与验收标准。
3. [`M9-00_ACTIVATION_GOVERNANCE.md`](M9-00_ACTIVATION_GOVERNANCE.md)：M9激活治理与权威文档同步。
4. [`M9-01_REFACTOR_SAFETY_NET.md`](M9-01_REFACTOR_SAFETY_NET.md)：已完成的重构安全网。
5. [`M9-02_SHARED_STRUCTURE.md`](M9-02_SHARED_STRUCTURE.md)：已验证的Shared Structure拆分。
6. [`M9-03_WRITING_TOOLS_DISPLAY.md`](M9-03_WRITING_TOOLS_DISPLAY.md)：当前AR-03—AR-14统一执行任务卡。

## 激活规则

- M9-03是AR-03—AR-14唯一活动任务；不得为M9-04—M9-14另建任务卡、Runtime、正式分支或PR。
- M9-03 Runtime声明统一依赖、允许路径、禁止路径、验证矩阵和回退边界。
- 统一实施PR正文必须绑定`worldforge-task: M9-03`标记。
- 各AR按冻结依赖作为内部检查点推进；高风险检查点必须先保存回退说明和专项验证结果。
- main只接受全部AR完成且永久门禁成功的受检Head；合并后必须完成Main Verification和独立Verified关闭。
