# WorldForge M8 发布硬化与验收任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

完成安全、数据、AI边界、性能、E2E、显示、跨平台构建、P0追踪和发布关闭。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M8-01 | [安全、数据、Migration与隐私硬化](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | M7、M6 | 将前序安全、数据、Candidate类型、GenerationRun、状态提取和隐私设计验证为发布阻断门。 |
| M8-02 | [性能、E2E、显示与AI Eval验收](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | M8-01、M7-03 | 在真实规模下验证取消、Skeleton、partial、T0/T1、状态提取、人工统计、性能、显示与模型支持。 |
| M8-03 | [跨平台构建、P0追踪与发布关闭](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | M8-01、M8-02 | 完成Windows、macOS、Linux构建验证、P0追踪关闭、文档同步和最终发布判断。 |

## 阶段退出门

- 安全、Migration、数据恢复、AI边界、性能、E2E和AI Eval全部有证据。
- Skeleton不得进入正文，partial不得误作完整稿，state_extract不得直接写权威状态。
- GenerationRun、Candidate、StateProposal、Prompt和约束来源引用完整。
- 取消后无迟到delta污染Renderer，重启状态不伪装网络流已恢复。
- 人工写作统计排除AI和系统变更。
- Windows、macOS、Linux构建与升级路径完成验证。
- P0追踪矩阵关闭并形成明确发布结论。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- M8-01硬门未通过不得进入M8-02最终性能与AI验收。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
