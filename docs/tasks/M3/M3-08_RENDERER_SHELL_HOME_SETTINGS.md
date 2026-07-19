# M3-08 Renderer壳层、首页、项目与设置迁移

> 状态：Planned  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`refactor/m3-renderer-shell-home-settings`

## 目标

将应用壳、首页、项目生命周期、最近项目、Core状态、设置和响应式侧栏迁移到React组件与统一状态体系，建立六个一级入口的真实导航骨架。

## 阶段定位

先迁移低风险共享壳层，为规划、设定、正文、候选及M4—M6工作台提供稳定导航、状态仲裁、焦点和返回位置基础。

## 非目标

- 不迁移Tiptap正文、Version、Candidate、规划和设定编辑器。
- 不改变现有Core命令和IPC语义。
- 不显示尚未实现的功能为可用入口。
- 不建立新手版和专业版两套页面代码。

## 依赖

M3-07

## 关联

- 需求：REQ-002、REQ-003、REQ-004、REQ-038、REQ-040、REQ-041
- 功能ID：APP-002、PRJ-001—004、UI-001、UI-004—007
- 验收：P0-008—P0-011、P0-057—P0-066基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/ACCESSIBILITY.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `tests/unit/`
- `tests/security/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

## 实施内容

1. 实现React AppShell、TopBar、PrimaryNav、Sidebar/Drawer、TaskBar和安全Banner。
2. 迁移首页、最近项目、项目健康、新建、打开、关闭、移动、重新定位和恢复入口。
3. 迁移通用、编辑器、外观显示和高级设置基础分区。
4. 固定首页、规划、写作、设定、检查、设置六个一级入口。
5. 新手/专业模式只改变披露和布局，共用数据、组件与命令。
6. 接入统一空、加载、失败、只读、恢复成功和防重复提交状态。
7. 恢复合法路由、侧栏和返回位置，临时Dialog不跨重启恢复。
8. 删除对应旧DOM引用、事件监听和全局状态，禁止双重控制同一节点。

## 测试与证据

- 现有首页、项目和设置路径行为等价。
- Core失败、路径异常、只读和恢复入口正确显示。
- 模式切换不改变数据和命令。
- 1280×800、2K 125%、21:9布局通过。
- 键盘、焦点、Esc和Drawer焦点恢复通过桌面E2E。

证据保存到：`docs/test-evidence/M3-08/`

## 完成条件

- 应用壳、首页、项目和设置不再依赖旧`index.ts`。
- 六个一级入口和状态优先级符合冻结信息架构。
- 未迁移业务继续可达，安全与恢复行为无退化。

任务关闭前必须同步`TASK_INDEX.md`、追踪矩阵及实际受影响的UI、IPC、安全和测试文档。
