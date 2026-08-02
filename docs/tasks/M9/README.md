# M9 V1.1 架构治理

本目录保存V1.0封版后、V1.5功能开发前的保持行为架构拆分任务。

## 当前状态

```text
ACTIVE
```

M8-09继续作为V1.0 `VERIFIED_HOLD`兼容锚点；M9使用`TASK_AUTHORIZATION.json`的`parallel-pr`模式和`docs/tasks/runtime/`机器状态。M9-03统一承接AR-03—AR-14，M9-04—M9-14不恢复独立任务状态。作者于2026-08-01要求先合并已完成检查点，再从main继续，因此M9-03采用同一Runtime下的受控分段交付；main写入与Main Verification保持串行。

当前进度：

- M9-00：激活治理与权威文档同步，Verified。
- M9-01 / AR-01：重构安全网，Verified。
- M9-02 / AR-02：Shared Structure，Verified。
- M9-03 / AR-03、AR-04：PR #272已合并至main提交`7adafeea`。
- M9-03 / AR-05：当前执行，续作分支`work/m9-03-ar05-ar14-continuation`。
- M9-03 / AR-06—AR-14：待按冻结依赖推进。
- M9-04—M9-14：Removed（absorbed by M9-03）；只移除独立执行形式，全部冻结要求由M9-03承接。

## 文档入口

1. [`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)：目标架构、不变量、实施顺序、门禁与完成定义。
2. [`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)：AR-01—AR-14工作包、范围、依赖、风险与验收标准。
3. [`M9-00_ACTIVATION_GOVERNANCE.md`](M9-00_ACTIVATION_GOVERNANCE.md)：M9激活治理与权威文档同步。
4. [`M9-01_REFACTOR_SAFETY_NET.md`](M9-01_REFACTOR_SAFETY_NET.md)：已完成的重构安全网。
5. [`M9-02_SHARED_STRUCTURE.md`](M9-02_SHARED_STRUCTURE.md)：已验证的Shared Structure拆分。
6. [`M9-03_WRITING_TOOLS_DISPLAY.md`](M9-03_WRITING_TOOLS_DISPLAY.md)：当前AR-03—AR-14统一执行任务卡与检查点状态。

## 激活规则

- M9-03是AR-03—AR-14唯一活动任务；不得为M9-04—M9-14另建任务卡或Runtime。
- M9-03 Runtime声明统一依赖、允许路径、禁止路径、验证矩阵和回退边界。
- 每个M9-03检查点PR正文必须绑定`worldforge-task: M9-03`标记。
- 各AR按冻结依赖推进；高风险检查点必须先保存回退说明和专项验证结果。
- 已合并检查点必须绑定受检Head、main提交和回退边界；续作检查点必须从最新main建立新分支，禁止在squash后的旧分支历史上叠加重复提交。
- AR-03—AR-14全部完成、续作PR永久门禁成功并完成Main Verification后，才允许独立关闭M9-03为Verified。
