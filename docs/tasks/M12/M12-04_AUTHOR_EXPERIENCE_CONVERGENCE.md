# M12-04 作者体验收敛与交互一致性

> 状态：In Progress  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`b2dd6aa30c76ef9d8277098c54761b9b5ab9697b`

## 目标

在不增加大型功能模块、不改变作品权威数据语义、不重写成熟正文/AI/恢复内核的前提下，对现有作者工作流做一次体验收敛：修复已经确认的交互状态不一致，统一应用内确认与输入体验，让三条创作路径真正影响作者入口，隐藏默认界面中过度暴露的技术状态，并整理内容检查与异步任务展示。

最终让作者只需要理解“继续写、规划、智能建议、审阅、保存、恢复”等作者语义，不需要理解 Revision、runId、promptId、内部任务阶段或浏览器原生弹窗。

## 阶段定位

- 承接 M11-01 中文作者体验基线、M11-06 日常写作界面精修、M11-07 长篇智能底座、M12-02 研究资料库和 M12-03 作者效率增强。
- 本任务属于成熟功能收敛，不扩产品边界。
- 保留经过验证的数据、事务、Candidate、Draft、Version、Recovery、ConstraintPackage 与 Electron 安全边界；只重写有明确收益的 Renderer 交互边界和状态所有权。

## 非目标

- 不新增 Agent、插件市场、社区、云同步或 WorldForge 自有云服务。
- 不重写 Tiptap / ProseMirror、自动保存、Draft、Version、Candidate、Candidate Apply、Recovery、SQLite 或 Generation 核心协议。
- 不新增数据库表、Migration、生产依赖或第二套状态真源。
- 不新增第二套规划模式、命令体系、AI任务体系、检查体系或确认弹窗体系。
- 不为文件行数机械拆分组件。
- 不修改 `pnpm-lock.yaml`。

## 依赖与真实承接基线

- M12-03 有效 VERIFIED。
- 启动基线：`b2dd6aa30c76ef9d8277098c54761b9b5ab9697b`。
- 启动时 `main`、`work`、`governance` 位于同一提交，没有开放 `work → main` / `governance → main` PR，`main-verification` 为 success。
- 本地审计来源：与上述 main 提交一致的 `666-main-7.zip`。

## 必读文档

1. `AGENTS.md`
2. `docs/PROJECT_EXECUTION_ENTRY.md`
3. `docs/tasks/TASK_AUTHORIZATION.json`
4. `docs/tasks/TASK_INDEX.md`
5. 本任务 Runtime
6. `docs/process/USER_PERSPECTIVE_AUDIT_REPORTING.md`
7. `docs/architecture/CODE_QUALITY_GOVERNANCE.md`
8. `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
9. M11-01、M11-06、M11-07、M12-02、M12-03 任务卡

## 主要影响范围

- `apps/desktop/renderer/src/features/planning/`
- `apps/desktop/renderer/src/features/research/`
- `apps/desktop/renderer/src/features/home/`
- `apps/desktop/renderer/src/features/writing/`
- `apps/desktop/renderer/src/features/checks/`
- `apps/desktop/renderer/src/features/canon/`
- `apps/desktop/renderer/src/features/structure/`
- `apps/desktop/renderer/src/components/`
- `apps/desktop/renderer/src/runtime/`
- `apps/desktop/renderer/src/presentation/`
- 必要的 AppShell 页面组合与首页模型
- 对应 `tests/unit/`、`tests/integration/`、`tests/e2e/`、必要的 `tests/performance/`

## 职责、状态所有权与依赖方向

1. **规划模式**：`AppDisclosureMode` 保持唯一模式真源；完整规划工作台不得维护局部“简明/完整”状态。
2. **研究资料**：列表筛选状态与当前编辑对象分离；筛选只改变列表，不拥有或销毁编辑草稿。
3. **确认与输入**：建立单一应用内作者操作弹窗；Feature 不再各自依赖浏览器原生 `window.prompt/window.confirm`。
4. **创作路径**：`creativePath` 只控制首页主行动、推荐排序和默认入口，不复制底层业务或权限。
5. **AI状态**：内部 stage/status 保持协议真源；Renderer 映射为作者语言，技术信息只在完整模式技术详情中展示。
6. **检查工作台**：现有 Search/Rhythm/Checks/Todo/Comment 组件保持业务所有权，只调整展示分区。
7. **任务刷新**：现有任务事件保持主通道；轮询只作为兜底，优先复用已有公共轮询/请求协调能力。

## 数据库、IPC与安全边界

- 无数据库 Schema 变化、无 Migration。
- 不改变 `project.sqlite` 或 `app.sqlite` 权威语义。
- 原则上不新增 IPC、事件或错误码。
- AI任务继续使用现有 task subscribe / status 接口。
- 不降低删除、结构修改、Candidate Apply、只读、LockGuard、未保存修改和恢复点保护。
- AI输出仍只能进入 Candidate，不能直接写 Draft。

## 实施内容

### WP1 交互状态正确性

1. 删除 `professional-planning-workbench.tsx` 内部伪“简明/完整”状态和按钮，规划模式唯一来源保持在 `PlanningModeWorkbench` / Settings。
2. 将研究资料的列表筛选与当前编辑上下文分离：搜索、标签、来源、归档、故事对象筛选不得要求放弃当前编辑内容；当前编辑笔记即使被筛选排除也继续保留，并提示“不在当前筛选结果中”。
3. 只有切换真实编辑对象、新建、删除/归档、离开工作台等会替换编辑上下文的操作才触发未保存确认。

### WP2 公共作者交互

建立单一应用内作者操作弹窗，统一支持普通确认、文本输入、选项选择、输入名称确认高风险操作；迁移 Feature / 普通 Runtime 中现有 `window.prompt/window.confirm`。程序关闭的同步安全兜底在不改变关闭握手前提下允许保留，并必须有明确注释和测试。

### WP3 作者工作流与 AI 展示

1. 让自主创作、人机协作、智能优先真正影响首页主行动、推荐顺序与默认入口，但不分叉底层功能。
2. 复用现有 `AuthorNavigationTarget` / `writing-action`，不新增路由或生成协议。
3. 统一 AI 运行状态作者语言：等待开始、准备上下文、生成建议稿、整理结果、完成/失败/取消。
4. 简明模式隐藏 runId、promptId、promptVersion、provider、输出用量、Revision、采用记录等；完整模式保留技术详情。

### WP4 工作台与后台机制收敛

1. 将内容检查重组为“内容检查 / 搜索 / 节奏 / 任务与批注”，复用现有组件且切换时保持状态。
2. 任务事件作为主通道，轮询仅作为失联兜底，不新增持续高频轮询。
3. 补充 8K / 20K 单章编辑统计与自动保存基线；只有真实测试证明性能超预算时才允许进一步优化。

## 自动化测试

至少覆盖：

- Planning：完整规划内部不存在第二套模式状态；模式仍由 Settings 单一真源控制。
- Research：编辑后执行搜索/标签/来源/归档/故事对象筛选，不弹放弃确认且草稿保留；切换真实笔记仍有未保存保护。
- Dialog：普通确认、文本输入、选项、高风险名称确认；Esc/取消、键盘焦点、只读/危险操作保护；Feature 不再直接调用原生 `prompt/confirm`。
- Creative Path：三条路径首页主按钮、说明、推荐顺序和目标导航不同，但底层权限与数据相同。
- AI / Candidate：简明模式不显示内部 stage/status、runId、promptId 等；完整模式可查看技术详情；生成与采用/撤销无回归。
- Checks：四个分区切换保持搜索、节奏、检查、任务/批注状态。
- Performance：8K / 20K 单章统计与自动保存路径记录真实基线。

## 人工验收

1. 打开作品 → 规划模式切换 → 无重复模式按钮。
2. 打开研究资料 → 修改未保存笔记 → 搜索/筛选 → 编辑内容仍在。
3. 执行删除、拆章、移章、Canon 修改 → 使用统一应用内弹窗，保护语义不降低。
4. 分别选择自主/协作/智能优先 → 回首页 → 主行动和推荐路径明显不同。
5. 发起 AI 生成 → 简明模式只看到作者语言 → 完整模式可展开技术详情。
6. 进入内容检查 → 四个分区之间切换 → 原有输入与筛选保持。
7. 关闭/重新打开作品 → 保存、恢复、Continuation 行为无回归。

## Evidence

保存到：`docs/test-evidence/M12-04/`

至少包含：`summary.md`、`commands.txt`、`known-risks.md`，并记录规划模式唯一真源、研究资料筛选不丢编辑稿、原生弹窗迁移、三条创作路径入口差异、AI信息分层、检查工作台状态保持和性能基线。

## 回滚策略

- 本任务无数据库迁移，可按工作包整体回滚 Renderer 与测试。
- 回滚不得修改作品数据、Version、Candidate、Recovery 或既有 AI 任务事实。

## 完成条件

- [ ] 规划模式只有一个状态真源。
- [ ] 研究资料筛选与编辑上下文完全分离。
- [ ] Feature / 普通 Runtime 的浏览器原生 `prompt/confirm` 已迁移到单一应用内作者弹窗；关闭握手例外明确且受测。
- [ ] 三条创作路径真实影响首页入口与推荐，但不分叉底层业务。
- [ ] AI与 Candidate 简明模式不再暴露无必要技术标识，完整模式仍可诊断。
- [ ] 内容检查工作台完成页内分区且状态保持。
- [ ] 异步任务刷新没有新增高频重复轮询。
- [ ] 8K / 20K 单章性能基线完成；无证据不进行过度性能重构。
- [ ] Runtime 指定验证真实通过，Ready Evidence 绑定最新实现提交。
- [ ] `work → main` 永久门禁、Controlled Merge、Main Verification、`task-verification/M12-04` 与 Integration Branch Synchronization 完整闭环。
