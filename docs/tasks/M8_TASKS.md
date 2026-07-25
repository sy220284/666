# WorldForge 原M8 发布硬化与验收需求摘要

> 状态：Absorbed by M4-04  
> 用途：保留安全、性能、跨平台与发布关闭要求；不得作为独立任务执行入口。

## 执行归属

原M8-01—M8-03全部由[M4-04 V1剩余功能整体实施与发布闭环](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)吸收，作为同一任务的最终内部阶段执行。

发现功能、数据模型或跨模块架构缺陷时，必须回到M4-04对应内部阶段完成真实整改并重跑受影响矩阵，不得在发布末尾用临时补丁、降级文案或伪证据掩盖。

## 需求范围

| 原ID | 需求来源 | 统一实施内容 |
|---|---|---|
| M8-01 | [安全、数据、Migration与隐私硬化](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | Electron、IPC、Migration、Candidate、GenerationRun、StateProposal、凭据、日志与恢复硬门。 |
| M8-02 | [性能、E2E、显示与AI Eval验收](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | 真实规模性能、完整Electron E2E、AI Eval、显示矩阵、写作统计与备份回归。 |
| M8-03 | [跨平台构建、P0追踪与发布关闭](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | Windows/macOS/Linux构建、安装升级、P0关闭、文档同步与发布判断。 |

## 统一退出要求

- Skeleton不得进入正文，partial不得误作完整稿，state_extract不得直接写权威状态。
- GenerationRun、Candidate、StateProposalBatch、StateProposal、Prompt和约束来源引用完整。
- 取消后无迟到delta污染Renderer，重启不伪装恢复已消失网络流。
- 人工写作统计排除AI、导入、替换、恢复、结构和系统变更。
- 安全、Migration、恢复、性能、E2E、Eval、主题、无障碍和显示矩阵均有真实证据。
- Windows、macOS、Linux均有真实构建验证或明确可审计的Blocked结论。
- P0-001—P0-075全部Verified或明确Blocked，输出允许发布、有条件允许或禁止发布结论。
- 统一证据进入`docs/test-evidence/M4-04/`，不再建立M8独立关闭状态。
