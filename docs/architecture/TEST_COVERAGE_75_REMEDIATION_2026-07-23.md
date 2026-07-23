# 产品源码测试覆盖率75%整改报告

## 1. 基线与范围

- 主线基线：`4538660ebf3d0c4f5889bdc1f18c25c34937ca09`。
- 活动任务：M4-01保持不变。
- 统计对象：Electron Main、Preload、Renderer以及Contracts、Core Service、Domain、Editor Core、Prompts源代码。
- 测试对象：单元、回归、集成、Migration与安全测试；性能测试和独立Electron E2E不参与V8覆盖率插桩。
- 验收线：Statements、Branches、Functions、Lines四项全局覆盖率均不低于75%。

## 2. 原始缺口

严格全量统计显示分支覆盖率不足50%，Electron Main、Preload和Editor Core存在大块关键路径未覆盖；同时workspace测试主要经编译产物执行，源码映射不完整。

## 3. 整改路径

1. 新增产品源码专用Vitest覆盖率配置，统一workspace源码Alias。
2. 补充Electron启动、窗口、IPC、Preload、Core进程入口和路由测试。
3. 补充Editor Core文档转换、中文Diff、Candidate Diff和Worker测试。
4. 补充Renderer Core恢复与响应式布局测试。
5. 补充Prompt清洗、解析、模式策略和Registry测试。
6. 将75%阈值纳入正式Quality门禁，阻止后续覆盖率退化。

## 4. 最终结果

最终覆盖率、测试数量与门禁结果以PR #175最新机器报告为准，达到验收线后更新本节并转为Ready。
