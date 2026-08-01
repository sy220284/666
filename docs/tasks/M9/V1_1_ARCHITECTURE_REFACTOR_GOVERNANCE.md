# WorldForge V1.1 架构拆分重构治理方案

> 状态：方案冻结并已激活实施
> 基线：`main@3448e5ae8ec0bdd2ce1f983141b0ba654957e2a9`  
> 适用版本：V1.0.0-r1之后、V1.5功能开发之前  
> 方案性质：保持行为的架构治理，不新增产品功能  
> 实施形式：AR-01、AR-02已独立Verified；AR-03—AR-14统一归入M9-03单一Runtime、正式分支和实施PR，按内部检查点逐包验证与回退

## 1. 治理目标

本方案用于消除V1.0代码中已经核实的高职责密度、巨型组件、跨Feature依赖、IPC聚合、Core Service多子域混合及源码字符串测试耦合，为V1.5时序状态、分层记忆、失效传播、卷级检查点和项目日记等能力建立可维护基础。

治理完成后必须满足：

1. V1.0已有功能、交互、数据模型、IPC协议、错误码和发布边界保持不变。
2. 写作会话、编辑器生命周期、自动保存、AI生成、候选审阅和历史版本拥有明确边界。
3. Renderer、Main、Preload、Contracts和Core Service分别按现有工作区内部职责拆分，不改变跨工作区依赖方向。
4. 关键行为由状态机、组件行为测试、Bridge契约测试和Electron E2E验证，不再依赖单个源码文件中的字符串位置。
5. 每个实施PR可独立回退，不依赖一次性全仓重构才能恢复可运行状态。

## 2. 不可破坏的不变量

以下不变量贯穿全部工作包，任何一项失败立即阻断：

- 项目、正文、设定、索引、日志、备份和配置仍只保存在用户本地。
- AI输出仍必须先成为Candidate，作者确认后才能写入当前稿。
- StateProposal仍只能由作者裁决后写入权威状态。
- `project.sqlite`仍是作品权威数据源。
- Draft Revision、内容Hash、锁定块、版本不可变性和项目路径边界仍由Core与数据库约束保证。
- Renderer不得导入Node内建模块。
- Main和Preload只依赖Contracts；Core Service保持现有Contracts、Domain、Prompts依赖方向。
- IPC Channel字符串、`PROTOCOL_VERSION`、正式错误码和公开Bridge方法不得因拆分改变。
- 不修改历史Migration，不在重构PR中新增数据库Schema。
- 不混入云存储、云同步、WorldForge自有AI中转服务、公开分发、自动更新或代码签名。

## 3. 已核实的结构问题

### 3.1 Renderer

- `writing-core-workbench.tsx`约3000行，集中管理编辑器、自动保存、章节会话、IME、续写位置、查找替换、AI生成、Candidate和Version。
- `app-shell-m3.tsx`约1300行，同时承担启动Hydration、项目生命周期、设置写入、导航保护、任务订阅、Workspace Attention和页面装配。
- `canon-core-workbench.tsx`约1800行，混合实体、连续性、叙事规划和状态提案。
- `professional-planning-workbench.tsx`约1800行，混合任务书、大纲、卷章、场景节拍、回收站及结构操作。
- Writing通过Planning文件复用`StructureNavigator`，形成不合理的Feature依赖方向。

### 3.2 跨进程链路

- `main/src/ipc-handlers.ts`集中注册大量领域Handler。
- `preload/src/index.ts`集中构建大部分WorldforgeBridge。
- `contracts/src/index.ts`同时承担重导出、IPC聚合和完整Bridge接口组合。
- `renderer-bridge-adapter.ts`聚合全部领域适配逻辑。

### 3.3 Core Service

第一梯队：

- `state-proposal.ts`混合状态提案、批次、章节尾快照和派生失效传播。
- `generation-run.ts`混合Run生命周期、Candidate持久化、部分结果和模型支持档案。
- `project-workspace.ts`混合创建、打开、移动、Manifest、路径安全和数据库上下文。
- `recovery.ts`混合备份、策略、清理、恢复、导出和文件完整性。

第二梯队：

- `search-index.ts`、`narrative-planning.ts`、`validation.ts`、`structure-operations.ts`、`draft.ts`和`import-export.ts`均存在可分离子域，但必须保留事务内聚性。

### 3.4 测试耦合

部分稳定性与功能测试直接读取具体源码文件并断言变量名、字符串或代码顺序。该方式能保护紧急修复，但会把正确行为绑定到单一文件位置，阻碍安全拆分。

## 4. 目标架构

### 4.1 Writing

```text
features/writing/
├─ writing-workbench.tsx
├─ session/
│  ├─ chapter-session-machine.ts
│  ├─ use-chapter-session.ts
│  └─ chapter-session-types.ts
├─ editor/
│  ├─ use-editor-lifecycle.ts
│  ├─ use-draft-autosave.ts
│  ├─ draft-save-context.ts
│  ├─ editor-selection.ts
│  ├─ continuation-anchor.ts
│  └─ paste-sanitizer.ts
├─ generation/
│  ├─ generation-studio.tsx
│  ├─ use-generation-run.ts
│  ├─ skeleton-review.tsx
│  └─ merge-source-picker.tsx
├─ candidates/
│  ├─ candidate-review-panel.tsx
│  ├─ use-candidate-review.ts
│  ├─ candidate-conflicts.ts
│  └─ candidate-selection.ts
├─ versions/
│  ├─ version-panel.tsx
│  ├─ historical-navigation-notice.tsx
│  └─ use-version-actions.ts
└─ toolbar/
   ├─ editor-toolbar.tsx
   └─ find-replace-toolbar.tsx
```

章节会话状态必须显式表达：

```text
idle → loading → ready → flushing → switching → failed
```

会话上下文必须同时绑定：

- `projectId`
- `chapterId`
- `draftId`
- `revision`
- `editorGeneration`
- `requestGeneration`

禁止继续用多个互不约束的Ref隐式表达同一个章节会话。

### 4.2 Shared Structure

```text
features/structure/
├─ structure-navigator.tsx
├─ structure-tree.tsx
├─ volume-editor-dialog.tsx
├─ chapter-editor-dialog.tsx
├─ structure-operation-dialog.tsx
├─ trash-panel.tsx
└─ structure-formatters.ts
```

Writing和Planning均依赖该领域，消除`writing → planning`依赖。

### 4.3 Canon与Planning

```text
features/canon/
├─ canon-workbench.tsx
├─ panels/
├─ forms/
└─ shared/
```

```text
features/planning/
├─ planning-workbench.tsx
├─ planning-mode-workbench.tsx
├─ professional-planning-shell.tsx
├─ brief/
├─ outline/
├─ scenes/
└─ planning-context-panel.tsx
```

### 4.4 AppShell

```text
app/
├─ app-shell.tsx
├─ app-shell-layout.tsx
├─ use-app-bootstrap.ts
├─ use-project-session.ts
├─ use-settings-persistence.ts
├─ use-workspace-attention.ts
├─ use-task-subscription.ts
├─ use-navigation-guard.ts
└─ global-status-model.ts
```

### 4.5 Contracts、Main与Preload

```text
contracts/src/
├─ bridge/
├─ ipc/
└─ index.ts
```

```text
main/src/ipc/
├─ register-ipc-handlers.ts
├─ handler-guard.ts
├─ app-ipc.ts
├─ settings-ipc.ts
├─ project-ipc.ts
├─ planning-ipc.ts
├─ draft-ipc.ts
├─ candidate-ipc.ts
├─ version-ipc.ts
├─ recovery-ipc.ts
├─ text-io-ipc.ts
└─ task-ipc.ts
```

```text
preload/src/bridge/
├─ invoke.ts
├─ create-app-bridge.ts
├─ create-project-bridge.ts
├─ create-planning-bridge.ts
├─ create-writing-bridge.ts
├─ create-recovery-bridge.ts
└─ create-task-bridge.ts
```

根入口继续提供完全兼容的公开导出和`window.worldforge`对象。

### 4.6 Core Service

保留现有公开服务类名作为Facade：

- `StateProposalService`
- `GenerationRunService`
- `RecoveryService`
- `ProjectWorkspaceService`

内部按Repository、事务用例和纯映射器拆分。一次权威事务不得被拆成多个异步服务调用。

## 5. 实施顺序

实施按十四个工作包推进，详细范围见同目录`V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md`。AR-01和AR-02已经独立Verified；AR-03—AR-14作为M9-03内部有序检查点，在同一正式分支和实施PR中完成。

```text
AR-01 重构安全网
AR-02 Shared Structure
AR-03 Writing纯工具与展示组件
AR-04 Writing章节会话状态机
AR-05 Canon拆分
AR-06 Planning拆分
AR-07 AppShell拆分
AR-08 Contracts拆分
AR-09 Preload拆分
AR-10 Main IPC拆分
AR-11 State Proposal与Generation拆分
AR-12 Project Workspace拆分
AR-13 Recovery与工具域拆分
AR-14 Legacy、CSS与最终结构收敛
```

依赖原则：

- AR-01完成前不得开始生产代码拆分。
- AR-04必须作为独立高风险检查点，不得在该检查点混入视觉、文案或AI功能修改。
- AR-08、AR-09、AR-10按Contracts→Preload→Main顺序推进。
- AR-11完成后方可进入V1.5状态与记忆功能开发。
- AR-12和AR-13必须分别形成检查点、专项验证和回退说明，禁止把两个高风险职责混为一次不可审查的改动。
- AR-14只做退役与收尾，不承载前序未完成的核心拆分。

## 6. 结构预算

结构预算使用“职责＋规模”双门槛：

| 文件类型               | 目标上限 |
| ---------------------- | -------: |
| 应用或工作台组合根     |    300行 |
| 普通React Panel        |    400行 |
| Hook或Controller       |    300行 |
| 纯工具模块             |    250行 |
| Main/Preload领域注册器 |    350行 |
| 普通Core事务服务       |    600行 |
| 强事务内聚服务         |    800行 |
| 非生成源码绝对上限     |   1000行 |

例外仅允许：

- 自动生成文件；
- SQL Migration；
- 纯常量数据；
- 有正式ADR说明且无法安全拆分的强事务模块。

结构门禁不得简单阻断所有现有超限文件。AR-01先建立基线，只禁止新增超限和继续增长；目标文件拆分完成后再逐项收紧。

## 7. 测试迁移原则

源码字符串测试按以下顺序替换：

1. 提取纯函数与状态机测试。
2. 增加组件行为测试，验证输入、加载、失败、取消和卸载。
3. 增加Bridge交互测试，验证请求参数、代次和结果处理。
4. 保留Core集成、Migration、安全与性能测试。
5. 关键用户链路继续由Electron E2E覆盖。

必须覆盖的写作会话矩阵：

- A→B→C快速切章，只挂载最后有效请求。
- 草稿加载期间旧编辑器不可继续写入。
- IME组合期间不得触发破坏性切换或结构键。
- 保存返回时编辑器已有新输入，不得错误标记为完全同步。
- Panel切换、路由跳转、窗口关闭前均执行统一Draft Flush。
- 只读项目保持浏览和导出能力，禁止写入。
- 组件卸载后不得接收旧请求或保留监听器。

必须覆盖的项目生命周期矩阵：

- 创建、打开、移动、关闭、自动重开和最近项目登记故障。
- 正式目录落盘后任何辅助元数据失败不得删除作品。
- 路径越界、目标冲突、空间不足和只读文件系统。
- 数据库迁移失败时恢复点和只读保护。

必须覆盖的IPC矩阵：

- Channel集合完全一致。
- 输入Schema与输出Schema完全一致。
- trusted sender、统一异常边界、诊断ID和隐私日志保持一致。
- Task MessagePort的ACK、重复事件、序号缺口和取消行为保持一致。

## 8. 统一实施PR的强制门禁

```text
pnpm task:validate
pnpm check:workspaces
pnpm check:boundaries
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
pnpm release:check
```

根据工作包增加专项门禁：

- Renderer拆分：中文IME、快速切章、Draft Flush、导航返回和1280×800布局。
- IPC拆分：Preload Surface、安全边界、通道集合和Core全链路集成。
- Core拆分：故障注入、事务回滚、幂等、项目路径、备份恢复和性能基线。
- 最终收敛：三平台Build、Package Smoke和发布资格检查。

## 9. PR治理规则

- AR-03—AR-14统一绑定M9-03任务、Runtime、正式分支和实施PR；M9-04—M9-14不再独立激活。
- 单个AR内部检查点只处理一个明确职责边界，并记录基线、专项验证和回退方案。
- 不允许“顺手修复”无关功能、视觉或文案。
- 数据库Schema、Migration、IPC协议或公开Bridge发生变化时，必须停止并重新立项。
- 任何P0数据路径失败、E2E失败、覆盖率下降或安全门禁失败立即阻断。
- 合并前记录基线Head、实施Head、永久门禁和专项验收结果。
- 使用`expected_head_sha`受控合并，防止审核后Head漂移。
- 全部内部检查点完成后合并统一PR并执行Main Verification；失败时回滚M9-03，不跨检查点追补。

## 10. 回退策略

每个工作包必须满足：

1. 公开入口保持兼容，旧调用方无需同时迁移全仓。
2. 新模块由Facade或组合根接入，可通过单次Revert恢复。
3. 不修改数据库持久化格式，回退后可继续读取同一作品。
4. 不在同一PR内删除旧实现并同时引入新功能。
5. 旧文件仅在行为测试、E2E和调用方全部迁移后删除。

AR-04、AR-10、AR-12和AR-13为高风险工作包，必须在合并前保存独立回退说明。

## 11. 激活状态

M9通过激活治理进入`parallel-pr`实施模式，并对剩余拆分采用统一任务：

1. M8-09继续作为最后一个V1.0 `VERIFIED_HOLD`兼容锚点。
2. M9任务通过`TASK_AUTHORIZATION.json`和独立Runtime激活，不改写V1.0终态锚点。
3. AR-01和AR-02已通过各自正式任务卡、Runtime和PR完成Verified。
4. AR-03—AR-14全部由M9-03统一任务卡和Runtime承接；M9-04—M9-14标记为`Removed（absorbed by M9-03）`，只移除独立执行形式。
5. M9-03按冻结依赖推进内部检查点，使用一条正式分支和一个实施PR；main写入、Main Verification和Verified关闭保持串行。

M9-03 Runtime的统一范围是AR-03—AR-14的唯一实施授权；不得为被吸收ID建立第二套状态或执行入口。

## 12. 完成定义

V1.1架构治理完成必须同时满足：

- AR-01、AR-02保持Verified，AR-03—AR-14内部检查点全部验收，并将M9-03关闭为Verified。
- Writing会话由显式状态机驱动，巨型核心工作台不再承担全部职责。
- AppShell、Canon、Planning、Contracts、Preload和Main IPC完成职责拆分。
- V1.5直接相关的State Proposal、Generation、Project Workspace和Recovery完成内部模块化。
- Legacy Surface兼容空接口退役，CSS责任域明确。
- 结构预算和同工作区依赖门禁正式启用。
- V1.0全部功能、数据、安全、性能和三平台打包能力无回归。
- 完成Main Verification并建立新的`VERIFIED_HOLD`锚点。
