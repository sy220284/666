# M3-08 React运行底座、Renderer壳层、首页、项目与设置迁移

> 状态：Implemented
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 机器分支：`work/m3-08-renderer-shell-home-settings`  
> 合并范围：原M3-08任务 + M3-07未完成React底座范围

## 目标

在PR #125已合并的Renderer迁移基础上，完成真实React运行底座，并将应用壳、首页、项目生命周期、最近项目、Core状态、设置和响应式侧栏迁移到React组件与统一状态体系，建立六个一级入口的真实导航骨架。

## 依赖基线

- PR #125 Checkpoint已进入main：`3522f2887da4c74fcf5de3a57aa87337fb270276`。
- M3-07已转为Deferred，其未完成范围由本任务完整吸收。
- Issue #126作为环境、锁文件、真实Root和全量验证执行单继续跟踪。

## 非目标

- 不迁移Tiptap正文、Version、Candidate、规划和设定编辑器。
- 不改变现有Core命令、Repository、数据库和IPC语义。
- 不显示尚未实现的功能为可用入口。
- 不建立新手版和专业版两套页面代码。
- 不建立任务专属Workflow，不由CI生成正式代码、锁文件或Evidence。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/ACCESSIBILITY.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`
- `tests/performance/`
- `docs/architecture/`
- `docs/ui/`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/test-evidence/M3-08/`

## 一、先完成React运行底座

1. 使用Node.js 24与pnpm 11.13.0安装精确版本React、ReactDOM、Zustand及类型依赖。
2. `pnpm-lock.yaml`必须由pnpm真实生成，`pnpm install --frozen-lockfile`必须成功。
3. Renderer启用TSX与`react-jsx`，构建入口切换到唯一真实`react-entry.tsx`。
4. 使用`createRoot`挂载可见、可诊断的唯一React Root；禁止隐藏占位根。
5. 将已合并的Bridge Adapter、请求生命周期、状态仲裁、兼容加载器和启动Runtime接入真实入口。
6. 建立React错误边界，P0错误保留`code`、`diagnosticId`、`retryable`、`userAction`和details。
7. 将`ui-state-boundary.ts`接入Zustand；禁止`persist`、`localStorage`、IndexedDB及业务权威对象。
8. React与Legacy不得同时控制同一DOM节点，旧Renderer只能单实例初始化。
9. 新React代码只能通过具名Bridge访问Preload，禁止新增`window.worldforge`直调。

## 二、迁移Renderer共享壳层

1. 实现React AppShell、TopBar、PrimaryNav、Sidebar/Drawer、TaskBar和安全Banner。
2. 固定首页、规划、写作、设定、检查、设置六个一级入口。
3. 新手/专业模式只改变披露和布局，共用数据、组件与命令。
4. 接入统一空、加载、失败、只读、恢复成功和防重复提交状态。
5. 恢复合法路由、侧栏和返回位置；临时Dialog不跨重启恢复。
6. 删除对应旧DOM引用、事件监听和全局状态，禁止双重控制。

## 三、迁移首页、项目与设置

1. 迁移首页、最近项目和项目健康状态。
2. 迁移新建、打开、关闭、移动、重新定位和恢复入口。
3. 迁移Core状态、重启Core和安全诊断出口。
4. 迁移通用、编辑器、外观显示和高级设置基础分区。
5. 保持只读、路径异常、恢复和错误码行为等价。

## 四、测试与证据

必须真实执行并记录：

- `pnpm install --frozen-lockfile`
- `pnpm task:validate`
- `pnpm check:workspaces`
- `pnpm check:boundaries`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm test:eval`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm package`

E2E至少覆盖应用启动、真实React Root、Core状态、项目创建/打开、设置、正文可达、保存、关闭、焦点恢复及1280×800、2K 125%、21:9布局。

证据保存到`docs/test-evidence/M3-08/`，四文件中必须单列M3-07转入要求的完成情况和真实退出码。

## 完成条件

- React依赖、规范锁文件、TSX、真实Root、Zustand和错误边界全部落地。
- 应用壳、首页、项目和设置不再依赖旧`index.ts`控制对应DOM。
- 六个一级入口与状态优先级符合冻结信息架构。
- 未迁移业务继续可达，安全、恢复、正文保存和关闭行为无退化。
- Unit、Integration、Migration、Security、Performance、Build、Electron E2E与Package全部真实通过。
- Evidence完整，任务登记Implemented并激活M3-09。
- M3批次关闭时依据M3-08 Evidence处理M3-07 Deferred关闭。
