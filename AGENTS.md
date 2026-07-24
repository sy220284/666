# AGENTS.md

## 1. 项目与权威性

WorldForge 是面向单一作者的本地优先桌面写作工作站。仓库实现冻结的 WorldForge V6.5 基线。

不得在已批准文档之外擅自扩展产品范围、架构、功能、依赖、云服务或任务顺序。

本文件是仓库级完整且唯一的 Agent 权威指令。`agent.md` 仅是快速执行入口，只摘录高频规则和权威文档链接；两者冲突时以本文件为准。

## 2. 强制启动顺序与动态状态

开始编码、重构、测试、Migration、UI、Prompt、文档、治理或发布工作前，按以下顺序读取：

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.json
4. docs/tasks/ACTIVE_TASK.md
5. ACTIVE_TASK 指向的独立任务卡
6. 任务卡列出的专项文档
7. 现有代码、测试、Migration、契约和追踪状态
```

固定规则：

- `ACTIVE_TASK.json` 是授权模式、活动任务、工作分支、允许路径、禁止路径和验证命令的机器真源。
- `ACTIVE_TASK.md` 是生成镜像，必须保持同步。
- 动态状态不得在本文件中重复固化；任务数量、当前阶段和当前授权以真实状态文件为准。
- 同时只能有一张任务处于 `IN_PROGRESS`。
- 里程碑摘要只做索引，不是可执行任务卡。
- 每张活动任务必须且只能指向 `docs/tasks/M0/` 至 `M8/` 下的一张独立任务卡。

## 3. 文档权威顺序

```text
作者最新明确指令
> 已批准的 ACTIVE_TASK 范围与验收
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结的专项规格、ADR、Schema、契约、UI、安全与 P0 验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 本 AGENTS.md 与执行手册
> 现有实现
```

发现冲突时不得静默处理。必须报告冲突来源、受影响文件和实现影响。

主要入口：

- 产品基线：`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- 执行入口：`docs/PROJECT_EXECUTION_ENTRY.md`
- 活动任务：`docs/tasks/ACTIVE_TASK.json`、`docs/tasks/ACTIVE_TASK.md`
- 任务索引：`docs/tasks/TASK_INDEX.md`
- 功能目录：`docs/product/FUNCTION_CATALOG.md`
- 追踪矩阵：`docs/product/V1.0_TRACEABILITY_MATRIX.md`
- 架构：`docs/architecture/`
- 数据库：`docs/database/`
- IPC/事件：`docs/contracts/`
- AI/Eval：`docs/ai/`
- UI：`docs/ui/`
- 安全：`SECURITY.md`、`docs/security/`
- 测试：`docs/testing/`
- 实现选择：`docs/decisions/IMPLEMENTATION_DECISIONS.md`
- 执行手册：`docs/process/CODEX_EXECUTION_PLAYBOOK.md`
- 自动化：`docs/process/DEVELOPMENT_AUTOMATION.md`

## 4. 产品边界与不可妥协不变量

### INV-001 本地数据

项目正文、数据库、设置、索引、日志、Prompt、Eval、配置和备份必须仅保存在用户本机，不得接入云存储或云同步。外部模型调用由本地 Core 直接连接用户配置的端点。

### INV-002 Candidate 隔离

AI 输出先持久化为 Candidate，只有作者明确接受后才能进入 Draft。

### INV-003 单一真源

`project.sqlite` 是唯一权威项目数据源。Renderer 状态、Tiptap JSON、缓存、FTS、导出、摘要和日记均为派生数据。

### INV-004 代码强制安全

Lock、Revision、Hash、不可变 Version、项目/路径边界和事务完整性必须由代码保证。Prompt 不能充当安全控制。

### INV-005 作者裁决权

AI 可以提议文本、发现和状态变化，但不得直接修改 Canon、定稿文本或权威状态。

任一不变量失败都必须阻断合并和发布。

V1.0 只包含本地单作者写作闭环，不实现：

- 云存储、云同步、账号或托管后端；
- WorldForge 请求代理；
- 模型下载、安装、容器、GPU 或运行时管理；
- 向量数据库、Embedding、Rerank 或投机性检索适配器；
- MCP、CRDT、多人协作或插件市场；
- 自动发布、读者分析、无人监督偏好学习或无人审核批量生成；
- 社区、成就或商业系统。

## 5. 整体协调与工程质量

所有修改必须从整体配合与协调出发，同时考虑功能与代码的横向、纵向关联影响。

- 横向影响：同层模块、相邻功能、共享组件、公共契约、通用状态、共用测试、性能预算和用户体验。
- 纵向影响：Renderer → Preload → Electron Main → Core → Repository → SQLite，以及任务卡、Schema、Migration、IPC、Evidence 和发布链路。
- 修改前必须识别上游输入、下游消费者、数据生命周期、失败传播、恢复路径和既有兼容边界。
- 修复或新增代码后必须执行受影响范围回归，确认没有引入新的功能、数据、安全、性能、兼容性或体验问题。
- 功能交付必须同时满足正确实现、性能预算和可用体验；只有接口、数据库或后台逻辑存在，不能视为用户功能完成。
- 局部最优不得破坏整体架构、跨模块一致性、数据真源、恢复能力或后续任务可实施性。
- 可复用基础能力只实现一次，禁止形成语义重复、行为分叉或多套真源。

代码编写必须同时保持：

1. **规范性**：遵守仓库结构、类型、格式、命名、契约、边界和错误码规范。
2. **健壮性**：覆盖非法输入、空状态、失败、取消、超时、冲突、重试、幂等、只读、恢复和部分完成状态。
3. **可读性**：职责清晰，命名准确，控制流直接；复杂原因写入必要注释，禁止用注释掩盖混乱实现。
4. **可维护性**：减少隐式耦合和重复逻辑，保持单一职责、稳定接口和可定位变更范围。
5. **可扩展性**：为已批准的后续能力保留清晰扩展点，禁止为未批准需求预建复杂框架。
6. **可测试性**：业务逻辑可隔离验证，依赖可替换，失败路径可注入，关键不变量有回归测试。
7. **性能可控性**：遵守性能预算，避免无界循环、无界队列、全量扫描、重复序列化和高频跨进程调用；性能敏感修改必须测量。
8. **可观测性**：关键阶段、失败原因和状态转换必须可通过结构化日志、稳定错误码或诊断信息定位；不得记录正文、凭据或敏感内容。
9. **安全性**：默认最小权限、严格校验、路径与项目隔离、事务原子性、凭据保护和安全失败；安全检查失败必须阻断。

不得用过度设计替代最小完整实现。内部机制升级必须保持或提升正确性、用户行为、安全、可维护性、可测试性、恢复能力和性能，并记录理由及回归测试。

## 6. 任务、分支与实施模式

具体授权模式必须从 `ACTIVE_TASK.authorization` 读取，不得假设当前模式永远不变。

在 `implementation-pr` 模式下：

```text
一个活动任务
→ 一个正式任务集成分支
→ 最小完整端到端实现
→ 必要专项测试
→ Draft 快速反馈
→ Ready 永久门禁
→ 按需登记 Implemented 与 deferredVerification
→ Controlled Merge
→ Main Verification
→ 按 ACTIVE_TASK.authorization 决定推进或暂停
```

同一活动任务允许开发、测试、审查和文档并行，但必须遵守：

```text
一个正式任务集成分支
├─ 开发工作区或辅助分支
├─ 测试工作区或辅助分支
└─ 审查/文档工作区或辅助分支
        ↓
统一汇入正式任务集成分支
        ↓
一个 Ready PR
        ↓
一个受检 Head
```

- 辅助分支不得直接向 `main` 开普通任务 PR。
- 只能有一个正式任务 PR 和一个最终受检 Head。
- 开发、测试和审查可以并行；集成、Ready 门禁、合并和任务状态推进必须串行。
- `package.json`、锁文件、任务状态、Evidence Manifest 和共享入口文件由集成负责人统一修改。
- 最终 E2E、Evidence 提交绑定和 Verified 关闭必须在代码与测试汇合后完成。
- 阶段切换前必须完成上一阶段任务卡规定的关闭条件、延期验证和阶段硬门。
- 最终 Evidence、穷尽人工复核和 `Verified` 关闭可按里程碑批量处理；普通任务不得为关闭再创建第二个纯证据 PR。

只有以下情况中断连续实现：

- 数据、结构或安全缺陷；
- 阻断下游任务的缺陷；
- 任务状态、主线来源或 Evidence 损坏；
- 作者明确要求。

## 7. 修改前

必须明确并核实：

1. 任务 ID、目标和非目标；
2. 依赖状态、授权模式和真实基线；
3. 允许路径、禁止路径和目标分支；
4. 受影响包、入口和共享文件；
5. 上游输入、下游消费者及横向、纵向影响；
6. 数据库、Migration、IPC、Prompt、UI、安全、恢复、性能和体验影响；
7. 风险、兼容性和未决事项；
8. 实施顺序和验证命令。

必须检查真实仓库中的实现路径、测试、Migration、契约、Repository、Use Case、UI 状态、Mock、TODO、固定成功路径和最近相关变更。

## 8. 实施规则

- 可行时先写失败测试或稳定复现。
- 只做最小完整端到端改动，并完成必要 UI 接线。
- 除明确批准的治理修复外，不得修改 `ACTIVE_TASK.allowedPaths` 之外的文件。
- 不重构无关代码，未经批准不新增生产依赖。
- 不得以 TODO、空实现、固定成功、硬编码演示数据、吞错或仅写测试冒充完成。
- 不得静默改变冻结架构、产品范围、数据语义、错误语义或 UI 行为。
- 数据库、Migration、安全、项目边界、事务、恢复或关键性能预算失败必须阻断推进。
- 共享契约、Schema、Migration、IPC、类型、文档和追踪矩阵必须按实际影响同步。
- 写入后必须从真实 PR Head 重新读取关键文件，确认实现、接线、测试、文档和任务状态已落盘。
- 修复后必须复验原问题；新增后必须验证主路径、边界路径和失败路径；两者都必须执行关联回归。
- Formatter、Generator、测试和构建不得留下未提交的受跟踪文件变更。

## 9. 架构边界

```text
Electron Main
  生命周期、窗口、OS 集成、凭据代理、Core 监督

Preload
  命名白名单 API、边界校验、MessagePort Bridge

Renderer
  React、Tiptap、Zustand 和临时流式展示
  禁止 Node、SQLite、文件系统、环境变量和凭据

Core Service Utility Process
  SQLite 唯一写入者
  文件、FTS5、Provider、校验、导入导出、备份和恢复
```

包职责：

- `contracts`：严格 Schema、IPC 类型、事件和错误码；不包含业务实现。
- `domain`：纯实体和不变量；禁止 Electron、React、SQLite、文件系统和网络。
- `core-service`：Repository、Migration、写队列、Provider、FTS、校验、备份和导入导出。
- `editor-core`：Tiptap Schema、Block Patch、锁定、Block 映射和中文编辑算法。
- `prompts`：版本化 Prompt、约束序列化、解析和清洗。
- `testkit`：Fixture、Stub、故障注入和临时项目；不得成为生产依赖。

## 10. 数据库与写作规则

- `app.sqlite` 只存应用设置和元数据，不存项目正文。
- 每个项目只有一个权威 `project.sqlite`。
- 所有写入通过 Core 单一串行写队列。
- Migration 合并后只追加、不修改。
- Draft Patch、Candidate 接受、Version 创建、StateProposal 处理、结构操作、导入和 Migration 必须原子化。
- Autosave 每次已提交事务只增加一次 Draft Revision。
- Version 与 VersionBlock 没有业务更新路径。
- FTS、统计、摘要和缓存必须可重建。
- 每章只有一个活动 Draft。
- Candidate 不得覆盖 Draft。
- AI、替换、拆分、合并和移动操作必须遵守 LockGuard、Revision 和 Hash。
- 高风险操作复用统一恢复点基础能力。
- 当前 Schema 版本从有序 Migration Registry 派生，禁止硬编码。

## 11. Electron、IPC、Provider 与 Prompt

BrowserWindow 必须使用：

```ts
nodeIntegration: false;
contextIsolation: true;
sandbox: true;
webSecurity: true;
```

- Preload 只暴露命名的最小 API。
- 每个 IPC 和外部模型载荷必须使用严格 Schema 校验。
- 阻止远程导航和新窗口；批准的外部链接交给 OS 浏览器打开。
- Provider 只转换协议，不查询项目数据、不持久化 Candidate。
- 凭据保存在 OS Credential Store；SQLite 只保存 `credentialRef`。
- Prompt 使用稳定 ID 与整数版本，并绑定输入/输出 Schema。
- Prompt 变更必须对应 Eval。
- 流式增量必须批处理，禁止每个 Token 发送一次 IPC。
- 用户可见 AI 阶段必须映射到真实程序阶段。

## 12. UI 与体验

- 正文始终是视觉中心。
- 用户功能必须在所属任务中形成可操作闭环；后续统一体验阶段不能替代首次接通。
- 新手模式与专业模式共用数据和命令。
- 主题不得分叉业务逻辑。
- 覆盖空、加载、成功、失败、取消、冲突、只读和恢复状态。
- 支持冻结的视口与 DPI 目标。
- 不使用绿色暗示 AI 文本更优。
- 未实现功能不得显示为可用。
- 性能优化不得以破坏交互反馈、可取消性、状态可理解性或错误可恢复性为代价。

## 13. 验证与 Evidence

必须运行任务卡要求的专项检查。基础命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

追加路由：

- Migration/Repository：`pnpm test:migration`、`pnpm test:integration`
- Electron/IPC/路径/安全：`pnpm test:security`、`pnpm test:e2e`
- Editor/Candidate/Lock/Revision：`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e`
- Prompt/Provider/AI Schema：`pnpm test:eval`、`pnpm test:integration`
- 性能/DPI/搜索/流式处理：`pnpm test:perf`，用户可见时追加 E2E
- 纯文档/Evidence：只运行治理与静态检查

未经真实执行，不得声称命令存在或通过。

Evidence 是版本化文本记录。新任务只强制：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

- `summary.md` 记录实现范围、真实测试结果、关联回归、必要人工复核和质量结论。
- `commands.txt` 只记录真实执行过的命令和结果。
- `known-risks.md` 记录剩余风险，无风险时明确写“无”。
- `manifest.json` 绑定文件完整性和来源提交。
- 不要求截图、截图清单、单独人工验收文件或单独质量矩阵。
- 不得只为满足 Evidence 生成截图或 Artifact。
- PR Evidence 只检查发生变化的任务目录；全部 Verified Evidence 在每周、手动、里程碑或发布门重放。

来源绑定：

```text
实施验证
└─ 绑定受检 PR Head

最终 Evidence
├─ manifest.commit 绑定 Squash 后可达的 mainCommit
├─ 记录 implementationHead 与 mainCommit
└─ 通过 Tree SHA 一致性证明 mainCommit 内容等同受检 PR Head
```

默认不生成截图。只有在定位真实 UI 故障且文字、日志或自动化结果不足时，才可按风险保留截图。

## 14. 完成状态与主线闭环

### 可登记 Implemented

- 真实实现存在于 PR Head；
- 必要专项测试、关联回归和永久 Ready 门禁通过；
- Migration、契约、UI、性能与文档按影响范围同步；
- 不存在无关重构、假数据、TODO、空实现或伪造成功；
- 延期最终验证已登记。

`Implemented` 可以按授权规则满足后续编码依赖，但不能冒充 `Verified`、阶段关闭、发布或最终验收。

### 可登记 Verified

- 最终四文件 Evidence 完整；
- Evidence 绑定可达的 `mainCommit`；
- `implementationHead` 与 `mainCommit` 的 Tree SHA 一致；
- 任务或里程碑最终验收完成；
- `TASK_INDEX`、任务卡、追踪状态和 ACTIVE_TASK 一致。

### 可声明主线闭环

只有以下条件全部真实成立：

- 受检 Head 的永久门禁通过；
- Controlled Merge 已实际完成；
- Main Verification 已成功；
- 必要任务状态已写入 `main`；
- 重新读取真实 `main` 和关键文件确认结果；
- 原问题或新增功能已按原始要求复核，关联功能、性能和体验未出现新回归。

不得把 Runner 成功、PR 可合并、Artifact 上传或补丁生成单独作为完成证明。

## 15. 仓库真源与自动化边界

```text
任务卡和批准文档定义结果
→ 开发执行端写入正式文件
→ PR Head 包含实现真源
→ 通用工作流验证已提交 Head
→ Controlled Merge 合并未变化的受检 Head
→ Main Verification 验证最终来源与静态一致性
```

- 永久工作流可以校验、构建、测试、打包并输出诊断，但不得在临时 Runner 工作树中生成或改写正式业务代码、任务状态或产品文档。
- 每次写入前必须确认仓库、目标分支、基线 SHA、任务 ID 和允许路径；写入后必须重新读取真实分支文件。
- 未提交结果或临时 Runner 结果不能证明 PR Head。
- 单文件修改可使用 Contents API。
- 两个及以上正式文件必须优先使用 Git Blob/Tree/Commit 生成单个原子提交。
- 禁止连续逐文件提交制造可见中间态。
- 禁止为单个任务、分支或修复创建一次性 Workflow、Runner、Generator 或 Apply Patch 目录。
- 正式门禁必须在验证前后执行 clean-tree 检查。任何 Formatter、Generator 或测试若修改受跟踪正式文件，必须失败，直到所需变更被正式提交并重新运行。

出现以下情况时必须停止并从最新 `main` 重建：

- CI 生成的正式源码不在 PR Head；
- 出现任务专属 Workflow 或补丁目录；
- 临时脚本压过正式实现；
- 不同门禁验证不同 Tree；
- 任务、Evidence 或主线来源状态不一致；
- 写入错误仓库、分支或路径。

## 16. 提交、推送与合并说明语言

1. 人工编写的 Git 提交标题和提交说明必须使用中文。
2. Pull Request 的标题与描述必须使用中文。
3. 推送、同步、合并、关闭、回滚和诊断操作中面向人的标题、摘要、说明与评论必须使用中文。
4. 不得直接使用完整英文句子作为提交标题、PR 标题或描述；`fix`、`feat`、`chore` 等英文类型前缀改为“修复”“功能”“维护”“文档”“测试”“重构”等中文表述。
5. 代码标识符、文件路径、分支名、命令、协议名、库名和无法准确翻译的技术专名可以保留英文，但上下文说明必须使用中文。
6. CI、GitHub 或第三方工具自动生成且无法配置的固定英文状态名不属于人工标题与描述；可配置内容仍必须改为中文。
7. Controlled Merge 会使用 PR 标题生成 main 的 squash 提交标题，因此正式 PR 标题必须准确、完整并使用中文。
8. 提交或创建 PR 前必须复查标题和描述语言；发现英文标题或英文说明时，先修正再推送、合并或关闭。

推荐格式：

```text
修复(M4-01)：修正索引队列重建顺序
功能(M4-01)：实现项目词典管理
文档：优化 Agent 执行与质量规则
```

## 17. 网络与依赖阻塞回退

### 17.1 触发条件与诊断

- 依赖安装、包管理器激活或工具下载失败时，先检查工具版本、`packageManager`、锁文件、Registry、代理、DNS、TLS、认证、缓存和网络出口，确认故障层级并保留关键错误信息。
- 本地配置可修复时直接修复并复验；确认内部制品代理、上游 Registry 或公网出口在当前环境不可用后，立即切换回退路径。
- 不得通过反复无效重试、随意更换主版本、降级依赖、改写锁文件、关闭严格校验或采用未经验证的第三方镜像拖延或伪造推进。

### 17.2 GitHub Actions 离线工具链回退

GitHub Actions 具备可信联网环境时，优先执行：

```text
读取 package.json、packageManager 和锁文件
→ 固定 Node、包管理器、操作系统与 CPU 架构
→ 从官方 Registry 安装精确版本及全部传递依赖
→ 运行版本检查和仓库要求的最小验证
→ 生成离线工具包或完整开发依赖包
→ 写入 manifest、来源提交、锁文件摘要和 SHA-256
→ 上传为 Workflow Artifact
→ 通过 GitHub 连接器下载到当前环境
→ 校验、解压、安装并执行真实验证
```

- 离线包必须绑定源提交 SHA、锁文件 SHA-256、Node 版本、包管理器版本、操作系统、CPU 架构和生成时间；涉及原生模块时还要记录 Node ABI、Electron 版本及目标平台。
- 生成环境必须与使用环境兼容。Electron、esbuild、Playwright、原生 `.node` 模块及平台二进制不得跨操作系统或架构混用。
- 小型工具包可只包含 pnpm、Prettier、ESLint、TypeScript 等必要工具；完整开发包可包含根与各 Workspace 的 `node_modules`、pnpm Store 和平台二进制。选择满足当前任务的最小完整包，避免无界膨胀。
- GitHub Actions 中必须先按锁文件安装并运行至少版本检查及目标命令；无法完成本地导入时，格式、类型、构建、测试等可直接在正式 Actions 门禁继续执行，开发不得因本地网络故障停滞。

### 17.3 保存、安装与验证边界

- 离线包本体优先保存为 Workflow Artifact；需要长期稳定归档时可同步为 GitHub Release Asset。不得把 `node_modules`、`.pnpm-store`、Electron、esbuild、Playwright、原生模块或大型压缩包提交到普通 Git 分支。
- 仓库只保存可复现的永久工作流、通用构建/安装/校验脚本和说明文档；禁止为单个任务创建一次性 Workflow、临时补丁目录或把 Runner 产物当成正式源码。
- 下载后必须校验 SHA-256、来源提交、锁文件摘要、平台和版本，再解压到仓库外或 `.gitignore` 已排除目录；不得覆盖受跟踪正式文件或污染工作树。
- 安装完成后必须真实运行适用命令，例如包管理器版本、Formatter 版本、`format:check`、Lint、Typecheck、Build 和任务专项测试。Artifact 上传、下载、解压、命令存在或单次 Runner 成功均不能单独证明环境可用或任务完成。
- 该回退只替代依赖获取和工具安装路径，不得绕过任务范围、锁文件、严格依赖策略、永久门禁、Controlled Merge、Main Verification、Evidence 或完成声明条件。

## 18. 新任务启动前的全量实现基线复核

执行任何新任务卡前，必须以最新真实 `main` 为基线，通读仓库已经完成的全量代码及其配套测试、契约、Migration、IPC、UI 接线和近期相关提交。任务卡、设计文档和路线图定义预期结果，现有代码决定当前真实起点。

必须完成以下复核：

1. 梳理已经实现的功能、公共能力、数据结构、调用链、状态流转、错误语义和恢复路径；
2. 识别新任务涉及的上游输入、下游消费者、横向共享模块和纵向跨层链路；
3. 核对任务卡中的前提、接口、路径、数据语义和验收标准是否仍与现有实现一致；
4. 检查是否已有可复用能力、部分实现、兼容层、临时实现、历史债务或已废弃路径；
5. 检查新任务是否会形成重复实现、并行真源、接口分叉、数据断层、状态断裂、Migration 冲突、UI 与后台脱节或测试语义偏离；
6. 核对已完成任务之间的连续性，确认新实现能接入现有主流程，并保持既有功能、性能、体验、安全、恢复和可维护性。

发现任务卡与真实实现存在偏离时，必须先明确记录：

```text
任务卡原假设
→ 当前真实实现
→ 偏离原因
→ 受影响范围
→ 调整后的实施方案
→ 需要同步的任务卡、契约、文档和测试
```

在偏离未澄清、实施路径未统一前，不得直接按过期任务描述编码。需要调整任务卡时，应先完成任务范围和验收标准修正，再开始正式实现。

禁止：

- 只阅读任务卡和局部目标文件后直接编码；
- 依据设计文档推测代码现状；
- 绕过已有公共能力另建一套实现；
- 为满足单张任务卡破坏既有接口、数据真源或跨任务连续性；
- 将已实现代码误判为未实现并重复建设；
- 只验证新功能局部成功，不验证与已完成功能的完整衔接。

新任务完成后，必须重新沿既有主流程执行关联回归，确认：

```text
既有实现未被破坏
+ 新旧能力连接完整
+ 数据与状态连续
+ 契约和错误语义一致
+ UI、IPC、Core、Repository 与数据库闭环
+ 后续任务仍可在统一架构上继续实施
```

未完成全量实现基线复核，或无法证明新任务与现有实现连续一致，不得声明任务已正确启动或完成。
