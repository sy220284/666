# WorldForge（创世工坊）

WorldForge 是面向单个作者的本地优先桌面长篇写作工作站。核心原则是：作者负责裁决，AI只生成候选；所有作品、数据库、索引、日志、备份和配置保存在本机。

## 产品定位

```text
作者导演
→ 规划与设定
→ 基础正文写作
→ AI候选生成
→ 比较、融合与采用
→ 定稿与状态确认
→ 连续性维护
→ 校验、搜索、导出与恢复
```

AI接入只允许：

1. 本地应用直接调用用户自行配置的外部模型API。
2. 本地应用连接用户已经运行的本地兼容模型服务。

WorldForge不建设自有云端AI服务，不保存用户作品到云端，不代理模型请求。

## 五项核心不变量

1. 项目数据默认只在用户本机。
2. AI输出必须先成为Candidate。
3. `project.sqlite`是项目唯一权威数据源。
4. 锁定、Revision、Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有正文、Canon和状态的最终裁决权。

## V1.0核心功能

### 基础写作

- 新建、打开、关闭、移动和最近项目。
- 卷与章节增删改、排序、状态和目标字数。
- Tiptap块级正文、中文输入、粘贴清理。
- 800ms空闲自动保存、保存状态、字数统计、当前章查找。
- 手动历史Version、章节定稿和恢复为新当前稿。
- TXT/Markdown导入导出。
- 数据损坏只读打开、恢复点和恢复副本。

### 编辑安全与版本

- Block Patch、Revision、SHA-256内容Hash。
- UI与Core双层锁定。
- Draft/Candidate/Version三层正文模型。
- 中文结构Diff与字符Diff。
- 原子采用、ConflictSet、ApplyRecord和整体撤销。
- 回收站、拆章、并章和高风险结构恢复。

### 规划、设定与连续性

- 作品任务书、大纲树、SceneBeat。
- 人物、地点、势力、道具、能力、规则、事件和自定义实体。
- 静态Canon与动态EntityState分离。
- 时间线、知情信息和伏笔生命周期。
- 人物弧光和弧光里程碑。
- StateProposal、EndingSnapshot和旧章返修失效传播。

### AI写作

- OpenAI兼容、Anthropic及经批准的自定义适配器。
- OS Credential Store凭据管理。
- P0—P4约束包、FTS5检索、时序过滤和Token裁剪。
- 版本化Prompt、结构化输出、Cleaner和Eval。
- GenerationRun、真实阶段、流式、取消和partial Candidate。
- T0多候选骨架、T1章节扩写。
- 快速改写、结构性改写和多候选融合。
- 候选全屏比较、块级/SceneBeat级采用和冲突处理。

### 校验、搜索与交付

- 确定性、统计和AI语义校验。
- StoryTodo与批注。
- 全项目FTS5搜索和安全批量替换。
- 爽点密度、章末钩子、更新节奏和黄金三章建议。
- DOCX安全导入和TXT/Markdown/DOCX导出。
- 日常滚动、重大操作、手动快照三轨备份。
- 恢复到新目录和安全空间清理。

### UI与显示

- 新手/专业模式和自主/混合/AI初稿三条路径。
- 写作、规划设定、候选校验等统一工作台。
- 沉浸写作、状态仲裁和上下文帮助。
- Theme A安静编辑部、Theme B水墨印章。
- 1280×800、2K、21:9和混合DPI支持。
- 键盘、焦点、减少动态和无障碍。

## 核心数据关系

```text
app.sqlite
└─ 应用设置、最近项目、Provider元数据、窗口/UI偏好

project.sqlite
├─ Volume / Chapter / Draft / DraftBlock
├─ Candidate / Version / ApplyRecord
├─ ProjectBrief / PlotNode / SceneBeat
├─ Entity / CanonFact / EntityState
├─ Timeline / Knowledge / Foreshadowing / CharacterArc
├─ GenerationRun / ConstraintPackage / ValidationIssue
└─ BackupRecord / TrashEntry / Dictionary
```

AI不会直接写当前稿：

```text
约束包
→ GenerationRun
→ Candidate
→ Diff与冲突检查
→ 作者选择
→ Block Patch
→ Draft Revision +1
```

## 技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- SQLite + better-sqlite3 + FTS5
- Zustand + Zod
- Vitest + Playwright
- pnpm workspace

## V1.0开发路线

任务体系采用一任务一文件，共52张任务卡，分为M0—M8九阶段：

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定、连续性与Renderer架构收口
→ M4 检索与AI基础设施
→ M5 AI生成与候选审阅
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

M1是明确的基础产品门。即使不配置AI，作者也必须能够创建项目、建卷章、写作、自动保存、保存版本、导入导出和恢复。

路线图：[`docs/roadmap/V1.0_ROADMAP.md`](./docs/roadmap/V1.0_ROADMAP.md)  
任务索引：[`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)  
需求追踪：[`docs/product/V1.0_TRACEABILITY_MATRIX.md`](./docs/product/V1.0_TRACEABILITY_MATRIX.md)

## 开发入口

任何任务按以下顺序启动：

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

当前`main`已进入作者预授权的连续开发模式，活动任务由机器状态文件控制：

[`M0-01 Monorepo、质量工具与CI`](./docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md)

自动化规范：[`docs/process/DEVELOPMENT_AUTOMATION.md`](./docs/process/DEVELOPMENT_AUTOMATION.md)

## 发布工具

发布配置使用GitHub Actions手工触发，默认创建Draft Release。发布前可在本地检查配置：

```bash
pnpm release:check
```

真实发布只允许从`main`执行，并同时要求输入版本与`package.json`一致、M8-03已经`Verified`。通过门禁后，工作流会在Linux、Windows和macOS分别打包，生成`SHA256SUMS.txt`，再创建不可覆盖的GitHub Release。当前M8-03仍为`Planned`，因此发布入口会明确失败而不会提前分发基础骨架。

## 关键文档

- [`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`](./docs/product/WORLDFORGE_V6.5_FULL_SPEC.md)：完整产品与架构基线。
- [`docs/product/FUNCTION_CATALOG.md`](./docs/product/FUNCTION_CATALOG.md)：全功能清单。
- [`docs/product/V1_SCOPE_AND_ACCEPTANCE.md`](./docs/product/V1_SCOPE_AND_ACCEPTANCE.md)：版本范围。
- [`docs/INDEX.md`](./docs/INDEX.md)：文档总索引。
- [`docs/PROJECT_EXECUTION_ENTRY.md`](./docs/PROJECT_EXECUTION_ENTRY.md)：执行统一入口。
- [`docs/decisions/IMPLEMENTATION_DECISIONS.md`](./docs/decisions/IMPLEMENTATION_DECISIONS.md)：冻结实现决策。
- [`docs/database/DATABASE_SCHEMA.md`](./docs/database/DATABASE_SCHEMA.md)：数据库Schema。
- [`docs/contracts/IPC_CONTRACTS.md`](./docs/contracts/IPC_CONTRACTS.md)：IPC契约。
- [`docs/ai/PROMPT_AND_EVAL_SPEC.md`](./docs/ai/PROMPT_AND_EVAL_SPEC.md)：Prompt与Eval。
- [`docs/ui/UI_ACCEPTANCE_CHECKLIST.md`](./docs/ui/UI_ACCEPTANCE_CHECKLIST.md)：UI验收。
- [`docs/testing/P0_ACCEPTANCE_MATRIX.md`](./docs/testing/P0_ACCEPTANCE_MATRIX.md)：P0验收。

## V1.5

V1.5在V1.0真实作者使用后单独立项：

- L0—L5自动分层记忆。
- 卷级连续性检查点。
- 定时AI项目日记。
- 超长篇专项适配。
- 有证据时的语义检索。

## 许可证

当前方案基线采用AGPL-3.0。正式发布前完成第三方依赖和分发策略许可证审查。
