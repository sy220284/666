# M3-07 Renderer React基础、Bridge适配与状态边界

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`refactor/m3-renderer-react-foundation`

## 目标

将Renderer从单文件命令式DOM入口迁移到冻结架构要求的React基础，建立Zustand UI临时状态边界、具名Bridge适配层、统一Design Token和可逐域迁移的兼容壳，不改变现有Core Use Case、IPC语义或业务结果。

## 阶段定位

在M3权威数据模型稳定后校正Renderer架构，使M4—M6新增检索、Provider、GenerationRun、候选和校验UI进入可维护的组件体系，避免把架构迁移与M7体验整合叠加为一次高风险重写。

## 非目标

- 不重写Core、Repository、Migration或现有业务规则。
- 不改变Preload白名单、IPC命令语义和错误码。
- 不在本任务迁移全部业务页面或删除旧入口。
- 不把Project、Draft、Candidate、Version、Canon或状态数据持久化到Zustand。
- 不引入第二套完整组件库，不提前实现M7视觉主题成品。

## 依赖

M3-06

## 关联

- 需求：REQ-038、REQ-039、REQ-040、REQ-041、REQ-047
- 功能ID：UI-001—UI-007、THM-001架构基础
- 验收：P0-057—P0-066、P0-075基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/ACCESSIBILITY.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `package.json`
- `pnpm-lock.yaml`
- `tests/unit/`
- `tests/security/`
- `tests/e2e/`
- `docs/architecture/`
- `docs/ui/`

## 实施内容

1. 引入React、ReactDOM和Zustand，建立`entry.tsx`、React Root、`App`与最小`AppShell`。
2. 建立`bridge/`具名适配层；业务组件不得直接调用`window.worldforge`，适配层统一错误码、诊断ID、取消、pending和陈旧请求保护。
3. Zustand只承载路由、当前选择、抽屉、Dialog、任务显示和返回位置；禁止持久化业务权威对象。
4. 建立P0—P3状态模型和`StatusArbiter`基础，统一Banner、TaskBar、页面状态和短时反馈。
5. Design Token集中为CSS变量；Radix仅作为无障碍行为底座，不复制业务状态机。
6. 将旧入口封装为可挂载、可卸载兼容面，明确事件注销、Tiptap销毁、Autosave flush和异步取消边界。
7. 增加静态规则：Bridge目录外禁止`window.worldforge`；React组件禁止命令式业务DOM；Zustand禁止持久化业务数据；主题不得选择不同业务命令。

## 测试与证据

- React Root在现有Electron CSP下启动，旧业务路径保持可用。
- Bridge适配层覆盖成功、稳定错误码、取消、重复提交和旧响应丢弃。
- Store测试证明项目业务对象不持久化、不成为提交基线。
- 静态扫描阻断新增Bridge直调、命令式DOM和散落Token。
- Electron冒烟覆盖启动、打开项目、进入正文、保存与关闭。

证据保存到：`docs/test-evidence/M3-07/`

## 完成条件

- React成为所有新增Renderer代码的唯一渲染路径，旧功能通过明确兼容面运行。
- `window.worldforge`仅在Bridge适配层出现。
- Zustand只保存UI临时状态，Core和SQLite继续保持唯一业务权威。
- 不改变Patch、Revision、Hash、LockGuard、Candidate和恢复语义。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的架构、UI、安全和测试文档。
