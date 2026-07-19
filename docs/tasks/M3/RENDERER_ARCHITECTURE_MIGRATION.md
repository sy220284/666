# Renderer架构迁移顺序

> 状态：Frozen  
> 适用任务：M3-07—M3-10

## 决策

Renderer迁移纳入M3收尾，不新增独立阶段。现有任务治理把`M4`阶段依赖解释为M3全部任务完成，因此新增四张M3任务卡后，M4会自动等待Renderer正式架构收口。

## 顺序

```text
M3-06 权威连续性数据完成
→ M3-07 React基础、Bridge适配、Zustand UI边界与状态仲裁
→ M3-08 应用壳、首页、项目、设置与六入口导航
→ M3-09 规划、设定、结构、恢复与基础导入导出
→ M3-10 写作、Version、Candidate迁移与旧入口退役
→ M4 检索与AI基础设施
```

## 固定边界

- Core、SQLite、Use Case、IPC和Preload继续保持现有权威职责。
- Zustand只保存UI临时状态，不持久化项目业务对象。
- React组件不得直接访问`window.worldforge`，统一经过Renderer Bridge适配层。
- 迁移采用逐域替换；React与旧代码不得同时控制同一DOM节点。
- M3-10完成前，M4不得继续向旧`renderer/src/index.ts`增加业务入口。
- M7负责导航、体验、主题、响应式与无障碍的最终统一，不承担基础框架重写。

## 验收原则

每张任务独立PR和证据目录；现有Electron E2E作为行为等价门禁。正文保存、中文IME、锁定、Revision、Hash、Candidate隔离、Version不可变和恢复安全不得退化。
