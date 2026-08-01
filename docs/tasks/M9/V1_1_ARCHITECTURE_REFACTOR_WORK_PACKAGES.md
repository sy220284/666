# WorldForge V1.1 架构拆分重构工作包

> 状态：规划冻结，未进入机器任务索引  
> 上位方案：[`V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md`](V1_1_ARCHITECTURE_REFACTOR_GOVERNANCE.md)  
> 执行原则：一个工作包对应一个正式实施PR，禁止跨包混改

## 1. 总览

| 工作包 | 主题 | 依赖 | 风险 | 主要结果 |
|---|---|---|:---:|---|
| AR-01 | 重构安全网 | M8-09 | 中 | 行为测试、结构基线、依赖门禁 |
| AR-02 | Shared Structure | AR-01 | 中 | 消除Writing→Planning依赖 |
| AR-03 | Writing工具与展示拆分 | AR-01、AR-02 | 中 | Candidate、Version、工具组件独立 |
| AR-04 | Writing章节会话状态机 | AR-03 | 高 | 章节、编辑器、自动保存生命周期收敛 |
| AR-05 | Canon拆分 | AR-01 | 中 | 四个独立业务Panel |
| AR-06 | Planning拆分 | AR-02、AR-01 | 中 | 任务书、大纲、场景职责分离 |
| AR-07 | AppShell拆分 | AR-04、AR-05、AR-06 | 高 | 应用启动、项目会话、导航和任务控制器 |
| AR-08 | Contracts拆分 | AR-01 | 中 | Bridge与IPC聚合模块化 |
| AR-09 | Preload拆分 | AR-08 | 中 | 领域Bridge Factory |
| AR-10 | Main IPC拆分 | AR-08、AR-09 | 高 | 领域Handler注册器与统一Guard |
| AR-11 | State Proposal与Generation拆分 | AR-01 | 高 | V1.5状态与生成基础模块化 |
| AR-12 | Project Workspace拆分 | AR-01 | 高 | 创建、打开、移动、路径策略分离 |
| AR-13 | Recovery与工具域拆分 | AR-12 | 高 | 备份恢复及第二梯队服务收敛 |
| AR-14 | Legacy、CSS与最终结构收敛 | AR-02—AR-13 | 中 | 兼容层退役、预算收紧、最终验收 |

## 2. AR-01 重构安全网

### 目标

在移动生产代码前，建立能够验证行为等价、依赖方向和结构预算的安全网。

### 允许范围

- `scripts/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/architecture/`
- `docs/tasks/`
- 必要的测试辅助模块

### 必须实施

1. 新增同一工作区内部循环依赖检测。
2. 新增Renderer Feature依赖规则，禁止Writing依赖Planning等横向倒置。
3. 建立结构基线，记录现有超限文件，只阻止新增超限和继续增长。
4. 将Writing、AppShell、Planning、Canon和IPC关键源码字符串测试迁移为行为测试。
5. 增加章节会话、项目生命周期和IPC表面的Characterization Tests。
6. 保留必要的源码静态不变量测试，但不绑定具体文件位置和函数局部字符串。

### 禁止事项

- 不移动生产模块。
- 不修改产品行为。
- 不修改数据库、IPC协议、错误码或UI。

### 验收

- 现有Quality矩阵通过。
- 新门禁能识别人工注入的循环依赖、反向Feature依赖和新增超限文件。
- 关键稳定性测试在文件改名后仍能验证行为。

## 3. AR-02 Shared Structure

### 目标

将卷章树、结构编辑、回收站和结构操作从Planning工作台提升为共享领域。

### 目标文件

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

### 必须实施

- Writing与Planning改为依赖`features/structure`。
- 保持现有`data-*`测试标记、键盘行为、确认语义和Bridge调用顺序。
- 拆章、并章、跨章移动和永久删除仍必须先预览再确认。

### 验收

- 仓库不存在`features/writing`导入`features/planning`。
- 结构操作专项Unit、Integration和E2E通过。
- UI布局和中文提示不变。

## 4. AR-03 Writing工具与展示拆分

### 目标

先提取低风险纯工具和展示组件，不改变章节会话控制逻辑。

### 必须提取

- `paste-sanitizer.ts`
- `editor-selection.ts`
- `continuation-anchor.ts`
- `find-replace-toolbar.tsx`
- `version-panel.tsx`
- `historical-navigation-notice.tsx`
- `candidate-review-panel.tsx`
- `candidate-conflicts.ts`
- `candidate-selection.ts`
- Generation展示子组件

### 保持边界

- `WritingWorkbench`继续作为公开入口。
- Bridge方法、Props和测试标记保持兼容。
- 不改自动保存、切章、Editor挂载和卸载顺序。

### 验收

- Candidate预览、采用、撤销、冲突和Skeleton审阅行为一致。
- Version创建、定稿、恢复为新稿和历史定位行为一致。
- 粘贴清理的安全测试通过。

## 5. AR-04 Writing章节会话状态机

### 目标

将章节打开、Editor生命周期、自动保存、IME和续写位置从散布Ref/State收敛为显式状态机。

### 必须实施

```text
idle → loading → ready → flushing → switching → failed
```

- `useChapterSession`
- `useEditorLifecycle`
- `useDraftAutosave`
- 不可变`DraftSaveContext`
- 请求代次和Editor代次统一校验
- Draft Flush统一入口

### 核心不变量

- 新章节Draft成功读取前，旧会话仍是权威会话，但旧Editor必须停止编辑。
- A→B→C快速切换只允许C挂载。
- 旧保存响应不得覆盖新章节或新Editor。
- IME组合期间不得保存半成品或触发结构键。
- 保存返回后如存在新输入，状态必须显示仍待保存。
- 卸载、切Panel、路由跳转和关闭窗口共用同一Flush协议。

### 强制测试

- 快速切章延迟矩阵。
- 保存与输入交错矩阵。
- IME组合开始、更新、结束和切章矩阵。
- 只读项目、加载失败、取消和组件卸载。
- Electron真实Microsoft拼音E2E。

### 禁止事项

- 不改编辑器功能、工具栏布局和Candidate逻辑。
- 不与其他工作台拆分合并。

## 6. AR-05 Canon拆分

### 目标

按业务分区拆分：

- Entity Canon
- Continuity
- Narrative Planning
- State Proposal

### 必须实施

- 外层`canon-workbench.tsx`仅负责导航和Panel装配。
- 各Panel独立管理Bridge查询、命令和局部状态。
- 表单解析、标签和值格式化迁入共享模块。
- 删除、归档、状态失效和作者裁决安全边界保持不变。

### 验收

- 四个Panel可独立测试。
- 状态历史、时间线、知情、伏笔、人物弧和提案裁决行为无变化。
- 选中实体和跨页面导航保持精确定位。

## 7. AR-06 Planning拆分

### 目标

拆分任务书、大纲树、场景节拍和规划上下文。

### 必须实施

- `brief/`
- `outline/`
- `scenes/`
- `planning-context-panel.tsx`
- 简明与完整模式继续共享同一权威任务书。
- 复用AR-02的Shared Structure，不保留重复结构控制器。

### 验收

- 简明/完整模式切换不丢失内容。
- 大纲节点移动、场景节拍编辑和跨章移动保持原子性。
- 1280×800下结构标题和操作区无挤压回归。

## 8. AR-07 AppShell拆分

### 目标

将应用总控制器拆成独立Hook和纯状态模型。

### 必须提取

- `use-app-bootstrap.ts`
- `use-project-session.ts`
- `use-settings-persistence.ts`
- `use-workspace-attention.ts`
- `use-task-subscription.ts`
- `use-navigation-guard.ts`
- `global-status-model.ts`
- `app-shell-layout.tsx`

### 核心不变量

- `reopen-last`行为不变。
- 项目切换后旧Workspace Attention响应不得回写。
- 导航前正文Flush失败必须阻止离开。
- 设置写入保持串行，失败后回滚到已确认设置。
- 全局P0/P1/P2状态优先级不变。

### 验收

- AppShell组合根目标不超过300行。
- Bootstrap、Project Session、Navigation Guard可独立测试。
- 首页、设置、工作台切换和返回来源E2E通过。

## 9. AR-08 Contracts拆分

### 目标

将根`index.ts`中的Bridge、IPC和领域聚合迁入独立模块，根入口仅做兼容重导出。

### 核心不变量

- 所有导出名称保持不变。
- `IPC_CHANNELS`每个字符串完全一致。
- `PROTOCOL_VERSION`不变。
- Zod输入输出Schema不变。
- `WorldforgeBridge`方法签名不变。

### 验收

- 编译后的公开导出快照一致。
- Registered Command和Channel集合精确一致。
- Main、Preload、Renderer和Testkit无需一次性跨包重写。

## 10. AR-09 Preload拆分

### 目标

将大Bridge对象拆成领域Factory，`index.ts`只组合并暴露。

### 必须实施

- 统一`invoke()`与Envelope构造。
- App、Project、Planning、Writing、Recovery和Task独立Factory。
- 延续现有Continuity、Validation、Search等独立Bridge先例。

### 验收

- `window.worldforge`表面完全一致。
- 输入在IPC发送前完成Schema校验。
- 输出完成Schema解析。
- Task MessagePort ACK、重复事件和序号缺口恢复测试通过。
- Preload Surface安全测试通过。

## 11. AR-10 Main IPC拆分

### 目标

按领域拆分Handler注册器，共享统一安全与异常边界。

### 必须实施

- `handler-guard.ts`统一trusted sender、Schema错误、意外异常、诊断ID和隐私日志。
- 领域注册器只处理本领域命令映射。
- 总注册器负责注册、释放和Channel完整性检查。

### 核心不变量

- Channel集合完全一致。
- Query/Mutation错误语义不变。
- Credential Broker仍只在Main持有明文凭据。
- Handler释放时无重复监听器。

### 验收

- Main IPC安全、集成和异常边界测试通过。
- Renderer收到的正式错误码和作者化提示无变化。

## 12. AR-11 State Proposal与Generation拆分

### 目标

为V1.5状态、记忆和失效传播开发建立稳定内部边界。

### State目标结构

```text
core-service/src/state/
├─ state-proposal-service.ts
├─ proposal-batch-repository.ts
├─ ending-snapshot-service.ts
├─ derived-invalidation-service.ts
└─ state-row-mappers.ts
```

### Generation目标结构

```text
core-service/src/generation/
├─ generation-run-service.ts
├─ run-repository.ts
├─ candidate-persistence.ts
├─ partial-result-service.ts
└─ model-support-repository.ts
```

### 核心不变量

- 作者裁决边界不变。
- 尾快照只来源于符合条件的定稿版本。
- 失效传播范围和队列记录不变。
- T0、T1、改写、融合、部分结果和模型支持档案行为不变。
- 公开Facade类名与方法保持兼容。

### 验收

- 事务与故障注入测试覆盖每个子域。
- V1.5可直接依赖派生失效和快照服务，不再追加到单一巨型文件。

## 13. AR-12 Project Workspace拆分

### 目标

拆分创建、打开、移动、路径策略、Manifest和数据库上下文，同时保持生命周期串行化。

### 目标结构

```text
core-service/src/project-workspace/
├─ project-workspace-service.ts
├─ project-create.ts
├─ project-open.ts
├─ project-move.ts
├─ workspace-verifier.ts
├─ workspace-path-policy.ts
└─ workspace-manifest.ts
```

### 核心不变量

- Lifecycle Tail和请求幂等保持。
- 正式作品目录落盘后辅助登记失败不得删除作品。
- 移动失败保留原目录并清理临时目录。
- 路径越界、符号链接、只读和空间不足策略不变。
- 打开失败不得污染Active Project。

### 验收

- 创建、打开、移动、关闭和自动重开故障矩阵通过。
- 原作品数据Hash和数据库完整性验证通过。
- 独立回退说明完成。

## 14. AR-13 Recovery与工具域拆分

### 目标

先拆Recovery，再按事务边界处理Search、Validation、Structure Operations、Draft和Import/Export。

### Recovery目标结构

```text
core-service/src/recovery/
├─ recovery-service.ts
├─ backup-create.ts
├─ backup-cleanup.ts
├─ backup-restore.ts
├─ version-export.ts
└─ backup-manifest.ts
```

### 工具域原则

- Search：索引队列、FTS查询、词典分离。
- Validation：Issue、Todo、Comment分离。
- Narrative：伏笔和人物弧分离。
- Structure Operations：拆章、并章、移动、永久删除按用例分离。
- Draft：读取、Patch执行、审计记录分离。
- Import/Export：解析、计划、提交、渲染分离。

### 核心不变量

- 一次权威事务不得跨异步边界拆散。
- 备份校验、清理计划Hash、作者保护、恢复副本和导出原子写入不变。
- FTS、Diff、导入导出和事件循环性能不得退化。

### 验收

- Recovery全故障注入矩阵通过。
- 156万字FTS、1.2万行Diff、DOCX和备份性能基线不下降。
- 独立回退说明完成。

## 15. AR-14 Legacy、CSS与最终结构收敛

### 目标

完成兼容层退役、CSS责任域整理、结构预算收紧和V1.1最终验证。

### 必须实施

- 将`flushPendingDraft`和Presentation应用迁入正式Controller。
- 删除无实际职责的Legacy Surface空方法及过渡文案。
- CSS按基础Token、布局、组件和主题覆盖整理。
- 消除重复Selector和无说明的覆盖顺序。
- 原生确认框替换仅限已有流程等价迁移，不增加新交互。
- 将结构基线逐项收紧到正式预算。

### 验收

- 无可达Legacy业务入口。
- Theme A/B浅色、深色、高对比和减少动态验证通过。
- 1280×800、DPI矩阵、键盘和焦点验证通过。
- 全量Quality、安全、性能、E2E、Build、Package Smoke和Release Check通过。
- 建立V1.1新的Verified锚点。

## 16. 任务激活模板

工作包转为正式任务时，任务卡必须包含：

- 精确允许路径与禁止路径；
- 上游依赖；
- 行为不变量；
- 专项测试矩阵；
- 回退方案；
- 结构预算目标；
- 不涉及Schema、协议和新功能的声明；
- PR正文中的`worldforge-task`标记；
- Runtime状态从`PLANNED`进入`IN_PROGRESS`。

第一个正式任务只能是AR-01。高风险包不得并行修改同一核心文件；其他互不重叠的工作包是否并行，由激活治理根据实际文件范围决定。
