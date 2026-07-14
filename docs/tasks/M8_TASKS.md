# WorldForge M8 发布硬化与验收任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M8-01 | [安全、数据、Migration与隐私硬化](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | M7、M6 | 将前序安全和数据设计验证为发布阻断门，关闭所有绕过路径。 |
| M8-02 | [性能、E2E、显示与AI Eval验收](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | M8-01、M7-03 | 在真实数据规模、完整业务路径、目标显示环境和支持模型下验证性能与质量基线。 |
| M8-03 | [跨平台构建、P0追踪与发布关闭](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | M8-01、M8-02 | 完成Windows、macOS、Linux构建验证、P0追踪关闭、文档同步和最终发布判断。 |

## 阶段退出门

- 安全、Migration、数据恢复、性能、E2E和AI Eval全部有证据。
- Windows、macOS、Linux构建与升级路径完成验证。
- P0追踪矩阵关闭并形成明确发布结论。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
