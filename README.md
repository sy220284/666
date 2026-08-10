# WorldForge（创世工坊）

WorldForge是面向单个作者的本地优先桌面长篇写作工作站。作者负责裁决，AI只生成建议；作品、数据库、索引、日志、备份和配置全部保存在本机。

## 产品原则

1. 项目数据默认只在用户本机。
2. AI输出先成为建议稿或待确认设定更新建议。
3. `project.sqlite`是项目唯一权威数据源。
4. 锁定、Revision、内容Hash、不可变历史版本及路径边界由代码保证。
5. AI只能提议，作者拥有正文、已确认设定和状态的最终裁决权。

AI接入只允许：

- 本地应用调用用户自行配置的模型API；
- 本地应用连接用户已经运行的本地兼容模型服务。

WorldForge不建设自有云端AI服务，不保存用户作品到云端，不代理模型请求。

## 当前状态

当前目标版本为`1.0.0`。M0—M9及M10-01—M10-03已经完成有效Verified闭环；M10-04已完成工程实现并由PR #312执行永久门禁验证。最新已验证仓库基线为：

```text
main == work == 8f54dc4e5ed46d6ffca999fda29887f2302b1030
```

M10-04保留用户数据兼容、Provider适配和协议版本门禁，退役空载Renderer Legacy层、旧任务状态入口及永久动态双读。

## 已实现能力

- Electron安全壳、Utility Process Core、SQLite Migration、单写队列、严格IPC和任务协议。
- 项目、卷章、Tiptap中文正文、自动保存、查找、历史版本、只读打开和恢复。
- Block Patch、Revision、Hash、锁定、Candidate、Diff、冲突、采用、撤销与结构恢复。
- 任务书、大纲、Scene Beat、Entity、Canon、动态状态、时间线、伏笔、人物弧光和状态提案。
- FTS5全文搜索、作品词典、约束包、确定性与AI语义校验、节奏分析和安全替换。
- OpenAI兼容、Anthropic及批准的Custom Provider适配，凭据隔离与有界响应读取。
- T0/T1生成、快速改写、结构性改写、多候选融合、审阅与安全采用。
- TXT、Markdown和DOCX导入导出，三轨备份、恢复副本和空间清理。
- React统一工作台、双主题、响应式、DPI、键盘、焦点、无障碍和Windows中文输入验收。
- Windows、macOS、Linux便携工件、ASAR、Fuses、Hash与启动验证。

## 核心数据关系

```text
app.sqlite
└─ 应用设置、最近作品、Provider元数据、窗口与UI偏好

project.sqlite
├─ Volume / Chapter / Draft / DraftBlock
├─ Candidate / Version / ApplyRecord
├─ ProjectBrief / PlotNode / SceneBeat
├─ Entity / CanonFact / EntityState
├─ Timeline / Knowledge / Foreshadowing / CharacterArc
├─ GenerationRun / ConstraintPackage / ValidationIssue
└─ BackupRecord / TrashEntry / Dictionary
```

AI不会直接写当前稿或权威状态：

```text
约束包
→ GenerationRun
→ 建议稿
→ 差异与冲突检查
→ 作者选择
→ 正文补丁
→ Revision +1
```

## 技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- Node `node:sqlite` + SQLite FTS5
- Zod
- Vitest + Playwright
- pnpm workspace

## 开发入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime
→ 当前任务卡
→ 专项文档、代码、测试、Migration与Evidence
```

当前活动任务：[`M10-04 兼容面收敛治理`](./docs/tasks/M10/M10-04_COMPATIBILITY_CONVERGENCE.md)。

- 任务索引：[`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)
- 执行入口：[`docs/PROJECT_EXECUTION_ENTRY.md`](./docs/PROJECT_EXECUTION_ENTRY.md)
- 自动化规范：[`docs/process/DEVELOPMENT_AUTOMATION.md`](./docs/process/DEVELOPMENT_AUTOMATION.md)
- 发布资格：[`docs/process/RELEASE_QUALIFICATION.md`](./docs/process/RELEASE_QUALIFICATION.md)

## 自用发布边界

V1.0仅供仓库所有者本人使用。交付形态为三平台便携包，要求原生构建、ASAR/Fuse/Hash、启动、既有作品兼容和本地数据安全。

不属于V1.0范围：代码签名与公证、系统安装器、自动更新及面向第三方或应用商店的公开分发保证。

## 关键文档

- [`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`](./docs/product/WORLDFORGE_V6.5_FULL_SPEC.md)
- [`docs/product/FUNCTION_CATALOG.md`](./docs/product/FUNCTION_CATALOG.md)
- [`docs/product/V1_SCOPE_AND_ACCEPTANCE.md`](./docs/product/V1_SCOPE_AND_ACCEPTANCE.md)
- [`docs/process/RELEASE_QUALIFICATION.md`](./docs/process/RELEASE_QUALIFICATION.md)
- [`docs/contracts/IPC_CONTRACTS.md`](./docs/contracts/IPC_CONTRACTS.md)
- [`docs/ai/PROVIDER_PROTOCOL.md`](./docs/ai/PROVIDER_PROTOCOL.md)
- [`docs/ui/UI_ACCEPTANCE_CHECKLIST.md`](./docs/ui/UI_ACCEPTANCE_CHECKLIST.md)
- [`docs/INDEX.md`](./docs/INDEX.md)

