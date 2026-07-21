# AGENTS.md

## 1. 项目

WorldForge 是面向单一作者的本地优先桌面写作工作站。仓库实现冻结的 WorldForge V6.5 基线。

不得在已批准文档之外擅自扩展产品范围、架构、功能、依赖、云服务或任务顺序。

## 2. 强制启动顺序

开始编码、重构、测试、Migration、UI、Prompt、文档、治理或发布工作前，按以下顺序读取：

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.json
4. docs/tasks/ACTIVE_TASK.md
5. ACTIVE_TASK 指向的任务卡
6. 任务卡列出的专项文档
7. 现有代码、测试、Migration、契约和追踪状态
```

规则：

- `ACTIVE_TASK.json` 是机器真源。
- `ACTIVE_TASK.md` 是生成镜像，必须保持同步。
- 同时只能有一张任务处于 `IN_PROGRESS`。
- 里程碑摘要只做索引，不是可执行任务卡。
- 每张活动任务必须且只能指向 `docs/tasks/M0/` 至 `M8/` 下的一张独立任务卡。
- `agent.md` 是中文快速镜像；本文件是仓库级权威指令。

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

## 4. V1.0 阶段

```text
M0 工程、安全与运行底座
→ M1 基础写作 MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与 AI 基础设施
→ M5 AI 生成与 Candidate 审阅
→ M6 校验、搜索与交付
→ M7 完整 UI 与体验整合
→ M8 发布硬化与验收
```

阶段规则：

- M1 必须交付可用的无 AI 写作产品。
- 未来 AI Schema、Prompt 或占位功能不得计入已完成产品进度。
- 上游基础能力存在后，才能实现下游能力。
- 在 implementation-first 模式中，`Implemented` 可满足同阶段后续编码依赖，但不能满足阶段关闭、发布或最终验收。
- M3-07 至 M3-10 必须在 M4 前完成 Renderer 向 React/Tiptap/Zustand 的迁移。
- 恢复、FTS、Candidate、Prompt 和备份等共享基础能力只实现一次并复用。
- V1.5 不得阻塞 V1.0。

## 5. 开发模式

### 5.1 Implementation PR 模式

默认开发路径：

```text
一个活动任务
→ 一个正式任务集成分支
→ 最小完整实现
→ 必要专项测试
→ Draft 快速反馈
→ Ready 永久门禁
→ 按需登记 Implemented 与 deferredVerification
→ Controlled Merge
→ Main Verification 来源与静态复核
→ 按 ACTIVE_TASK.authorization 决定推进或暂停
```

`Implemented` 表示真实代码和必要专项验证已经存在于受检 PR Head，不表示里程碑最终验收完成。

下一任务推进规则：

- `authorization.autoActivateNext=true` 且依赖满足时，可按既定任务顺序自动激活下一张任务。
- `autoActivateNext=false`、作者明确暂停或任一阻断条件存在时，必须停止并等待指令。
- 不得把 `Implemented` 冒充 `Verified`。

### 5.2 同任务并行工作

同一活动任务允许开发、测试、审查和文档工作并行，但必须遵守：

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
- 共享文件如 `package.json`、锁文件、任务状态、Evidence Manifest 和同一入口文件由集成负责人统一修改。
- 最终 E2E、Evidence 提交绑定和 Verified 关闭必须在代码与测试汇合后完成。

### 5.3 批次验证

最终 Evidence、穷尽人工复核和 `Verified` 关闭可按里程碑批量处理。普通任务不得为关闭再单独创建第二个纯证据 PR。

M3 连续实现到 M3-10 后执行阶段批次关闭；进入 M4 前必须完成 M3 必要验证闭环。

只有以下情况中断连续实现：

- 数据或结构安全缺陷；
- 阻断下游任务的缺陷；
- 任务状态或主线来源损坏；
- 作者明确要求。

## 6. 主要文档入口

- 产品基线：`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- 功能目录：`docs/product/FUNCTION_CATALOG.md`
- 追踪矩阵：`docs/product/V1.0_TRACEABILITY_MATRIX.md`
- 路线图：`docs/roadmap/V1.0_ROADMAP.md`
- 任务索引：`docs/tasks/TASK_INDEX.md`
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

## 7. 修改前

必须明确并核实：

1. 任务 ID、目标和非目标；
2. 依赖状态；
3. 允许和禁止路径；
4. 受影响包与入口；
5. 数据库、IPC、Prompt、UI、安全、恢复和性能影响；
6. 风险和未决事项；
7. 实施顺序；
8. 验证命令。

必须检查真实仓库中的实现路径、测试、Migration、契约、Repository、Use Case、UI 状态、Mock、TODO、固定成功路径和最近相关变更。

## 8. 实施中

- 可行时先写失败测试或稳定复现。
- 只做最小完整端到端改动。
- 除明确批准的治理修复外，不得修改 `ACTIVE_TASK.allowedPaths` 之外的文件。
- 不重构无关代码。
- 未经批准不新增生产依赖。
- 不得以 TODO、空实现、固定成功、硬编码演示数据或吞错冒充完成。
- 不得静默改变冻结架构、产品范围、数据语义或 UI 行为。
- 数据库、Migration、安全、项目边界、事务或恢复失败必须阻断推进。
- 写入后必须从真实 PR Head 重新读取关键文件。

只有在不扩大范围，并且保持或提升用户行为、安全、正确性、可维护性、可测试性、恢复能力和性能时，才可用更强内部机制替换规定机制。必须记录理由，并保留原始意图的回归测试。

## 9. 冻结产品边界

V1.0 只包含本地单作者写作闭环，不实现：

- 云存储、云同步、账号或托管后端；
- WorldForge 请求代理；
- 模型下载、安装、容器、GPU 或运行时管理；
- 向量数据库、Embedding、Rerank 或投机性检索适配器；
- MCP、CRDT、多人协作或插件市场；
- 自动发布或读者分析；
- 无人监督偏好学习；
- 无人审核批量生成；
- 社区、成就或商业系统。

## 10. 五项不可妥协不变量

### INV-001 本地数据

项目正文、设置、索引、日志、Prompt、Eval 和备份保留在本地。外部模型调用由本地 Core 直接连接用户配置的端点。

### INV-002 Candidate 隔离

AI 输出先持久化为 Candidate，只有作者明确接受后才能进入 Draft。

### INV-003 单一真源

`project.sqlite` 是唯一权威项目数据源。Renderer 状态、Tiptap JSON、缓存、FTS、导出、摘要和日记均为派生数据。

### INV-004 代码强制安全

Lock、Revision、Hash、不可变 Version、项目/路径边界和事务完整性必须由代码保证。Prompt 不是安全控制。

### INV-005 作者裁决权

AI 可以提议文本、发现和状态变化，但不得直接修改 Canon、定稿文本或权威状态。

任一不变量失败都必须阻断合并和发布。

## 11. 架构边界

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

## 12. 数据库与写作规则

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

## 13. Electron、IPC、Provider 与 Prompt 规则

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

## 14. UI 规则

- 正文始终是视觉中心。
- 用户功能必须在所属任务中可操作；M7负责统一，不负责首次接通基础能力。
- 新手模式与专业模式共用数据和命令。
- 主题不得分叉业务逻辑。
- 覆盖空、加载、成功、失败、取消、冲突、只读和恢复状态。
- 支持冻结的视口与 DPI 目标。
- 不使用绿色暗示 AI 文本更优。
- 未实现功能不得显示为可用。

## 15. 验证路由

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

## 16. Evidence

Evidence 是版本化文本记录。新任务 Evidence 只强制：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

- `summary.md`记录实现范围、实际测试结果、必要人工复核和质量结论。
- `commands.txt`只记录真实执行过的命令和结果。
- `known-risks.md`记录剩余风险，无风险时明确写“无”。
- `manifest.json`绑定文件完整性和来源提交。
- 不要求截图、截图清单、单独人工验收文件或单独质量矩阵。
- 不得只为满足 Evidence 生成截图或 Artifact。
- 旧 Evidence 可保留 Manifest 中登记的历史附加文件。
- PR Evidence只检查发生变化的任务目录；全部 Verified Evidence 在每周、手动、里程碑或发布门重放。

来源绑定规则：

```text
实施验证
└─ 绑定受检 PR Head

最终 Evidence
├─ manifest.commit 绑定 Squash 后可达的 mainCommit
├─ 记录 implementationHead 与 mainCommit
└─ 通过 Tree SHA 一致性证明 mainCommit 内容等同受检 PR Head
```

默认不生成截图。只有在定位真实 UI 故障且文字、日志或自动化结果不足以说明问题时，才可按风险保留截图；截图不是统一强制 Evidence 文件。

## 17. 完成状态

### 17.1 可登记 Implemented

同时满足以下条件：

- 真实实现存在于 PR Head；
- 必要专项测试和永久 Ready 门禁通过；
- Migration、契约、UI 和文档按影响范围同步；
- 不存在无关重构、假数据、TODO 或空实现；
- 延期最终验证已登记。

### 17.2 可登记 Verified

同时满足以下条件：

- 最终四文件 Evidence 完整；
- Evidence 绑定可达的 `mainCommit`；
- `implementationHead` 与 `mainCommit` 的 Tree SHA 一致；
- 里程碑验收或任务最终验收完成；
- TASK_INDEX、任务卡、追踪状态与 ACTIVE_TASK 状态一致。

### 17.3 可声明主线闭环

只有在以下条件均真实成立后才能向用户声明：

- 受检 Head 的永久门禁通过；
- Controlled Merge 已实际完成；
- Main Verification 已成功；
- 必要任务状态已写入 `main`；
- 重新读取真实 `main` 和相关文件确认结果。

不得把 Runner 成功、PR 可合并、Artifact 上传或补丁生成单独作为完成证明。

## 18. 仓库真源与自动化边界

```text
任务卡和批准文档定义结果
→ 开发执行端写入正式文件
→ PR Head包含实现真源
→ 通用工作流验证已提交Head
→ Controlled Merge合并未变化的受检Head
→ Main Verification验证最终来源与静态一致性
```

永久工作流可以校验、构建、测试、打包并输出诊断，但不得在临时 Runner 工作树中生成或改写正式业务代码、任务状态或产品文档。

每次写入前必须确认仓库、目标分支、基线 SHA、任务 ID 和允许路径；写入后必须重新读取真实分支文件。未提交结果或临时 Runner 结果不能证明 PR Head。

连接器或远程写入规则：

- 单文件修改可使用 Contents API。
- 两个及以上正式文件必须优先使用 Git Blob/Tree/Commit 生成单个原子提交。
- 禁止连续逐文件提交制造可见中间态。
- 禁止为单个任务、分支或修复创建一次性 Workflow、Runner、Generator 或 Apply Patch 目录。

正式门禁必须在验证前后执行 clean-tree 检查。任何 Formatter、Generator 或测试若修改受跟踪正式文件，必须失败，直到所需变更被正式提交并重新运行。

出现以下情况时必须停止并从最新 `main` 重建：CI生成的正式源码不在PR Head、出现任务专属Workflow、临时脚本压过正式实现、不同门禁验证不同Tree、任务/Evidence状态不一致，或写入了错误分支。