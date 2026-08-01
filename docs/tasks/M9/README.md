# M9 V1.1 架构治理规划

本目录保存V1.0封版后、V1.5功能开发前的架构拆分重构治理方案。

## 当前状态

```text
PLAN_FROZEN
```

本目录尚未进入机器任务索引，也未解除M8-09的V1.0 `VERIFIED_HOLD`。当前只冻结方案，不授权修改生产代码。

## 文档入口

1. [`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)：目标架构、不变量、实施顺序、门禁与完成定义。
2. [`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`](V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md)：AR-01—AR-14工作包、范围、依赖、风险与验收标准。

## 激活规则

开始实施前必须另行提交任务激活治理PR：

- 建立正式M9任务卡与Runtime状态；
- 更新`TASK_INDEX.md`；
- 将当前最终Hold改为指向第一个Planned任务；
- 只激活重构安全网工作包；
- 保持V1.0发布代码、数据库Schema、IPC协议和错误码不变。
