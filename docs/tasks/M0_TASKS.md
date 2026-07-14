# WorldForge M0 工程、安全与运行底座任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M0-01 | [Monorepo、质量工具与CI](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | 建立可安装、可编译、可测试、可打包的最小仓库骨架，形成所有后续任务可复用的工程入口。 |
| M0-02 | [Electron安全壳与Core生命周期](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | 建立可安全启动、监管和关闭的桌面应用壳，冻结Main、Preload、Renderer、Core Utility Process和OS能力边界。 |
| M0-03 | [SQLite、Migration与单写队列](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | M0-01 | 建立app.sqlite与project.sqlite的数据底座、Migration框架、完整性检查和串行写入机制。 |
| M0-04 | [IPC、错误码、事件与任务协议](M0/M0-04_IPC_EVENT_TASK_PROTOCOL.md) | M0-02、M0-03 | 建立严格可验证的命令通道、稳定错误码、可排序可恢复的长任务事件和取消机制。 |
| M0-05 | [测试基建、Fixture与故障注入](M0/M0-05_TESTKIT_FAULT_INJECTION.md) | M0-01、M0-02、M0-03、M0-04 | 建立后续任务统一复用的测试项目、Provider Stub、数据库故障、桌面E2E和证据工具。 |
| M0-06 | [显示、DPI与窗口恢复Spike](M0/M0-06_DISPLAY_WINDOW_SPIKE.md) | M0-02、M0-03、M0-05 | 在业务页面开发前验证窗口状态、响应式布局、正文宽度和混合DPI策略。 |
| M0-07 | [AI输出协议与中文Diff Spike](M0/M0-07_AI_DIFF_SPIKE.md) | M0-03、M0-04、M0-05 | 在完整AI功能前验证T0/T1输出模式、Provider故障、中文长段Diff和性能预算，输出明确采用或降级决策。 |

## 阶段退出门

- 全仓库可安装、lint、typecheck、test和build。
- Electron安全壳、Core生命周期、SQLite、IPC和任务协议真实可运行。
- 显示/DPI及AI/Diff关键风险有可复测结论。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
