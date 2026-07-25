# WorldForge（创世工坊）

WorldForge 是面向单个作者的本地优先桌面长篇写作工作站。核心原则：作者负责裁决，AI只生成候选；所有作品、数据库、索引、日志、备份和配置保存在本机。

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
2. AI输出必须先成为Candidate或待确认StateProposal。
3. `project.sqlite`是项目唯一权威数据源。
4. 锁定、Revision、Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有正文、Canon和状态的最终裁决权。

## 当前已完成基线

已完成并Verified：

- Electron安全壳、Core生命周期、SQLite、Migration、IPC、TaskProtocol和测试底座。
- 项目、卷章、Tiptap中文正文、自动保存、字数、查找、Version和只读恢复。
- Block Patch、Revision、Hash、LockGuard、Candidate、Diff、冲突、采用、撤销和结构恢复。
- 任务书、大纲、SceneBeat、实体、Canon、动态状态、时间线、知情、伏笔、人物弧光、StateProposal和EndingSnapshot。
- React Renderer正式架构。
- FTS5公共索引、项目词典和索引队列。
- P0—P4约束包、时序过滤、来源和裁剪追溯。
- OpenAI兼容、Anthropic和Custom Provider适配器、凭据隔离、端点安全和连接测试。

## V1.0目标功能

以下剩余目标统一由M4-04整体任务实施和验收：

### AI写作

- 生产Prompt Registry、GenerationRun、真实阶段、流式、取消和partial Candidate。
- 结构化T0多候选骨架。
- Skeleton、SceneBeat、直接章节目标三种互斥T1路径。
- 快速改写、结构性改写和多候选融合。
- 候选全屏比较、块级/SceneBeat级采用和冲突处理。
- Final Version状态提取、pending StateProposal和作者确认闭环。

### 校验、搜索与交付

- 确定性、统计和AI语义校验。
- StoryTodo与批注。
- Draft/Version/Entity全项目FTS5搜索和活动DraftBlock安全批量替换。
- 人工写作统计、爽点密度、章末钩子、更新节奏和黄金三章建议。
- DOCX安全导入和TXT/Markdown/DOCX导出。
- 日常滚动、重大操作、手动快照三轨备份。
- 恢复到新目录和安全空间清理。

### UI与显示

- 作者语言、继续写作、正文中心、设定结构化表单和结构操作可视化。
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

AI不会直接写当前稿或权威状态：

```text
约束包
→ GenerationRun
→ Candidate
→ Diff与冲突检查
→ 作者选择
→ Block Patch
→ Draft Revision +1

Final Version
→ state_extract GenerationRun
→ pending StateProposal
→ 作者确认
→ EntityState / ArcMilestone / EndingSnapshot
```

## 技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- SQLite + better-sqlite3 + FTS5
- Zustand + Zod
- Vitest + Playwright
- pnpm workspace

## V1.0开发路线

V1历史规格保留54份任务文件；独立执行体系为34张任务。M0—M3与M4-01—M4-03已经Verified，全部剩余功能统一由M4-04推进：

```text
M0—M3 已完成
→ M4-01 FTS 已完成
→ M4-02 约束包 已完成
→ M4-03 Provider 已完成
→ M4-04 V1剩余功能整体实施与发布闭环
```

M4-04吸收原M4-05—M8-03全部要求，采用：

```text
一个活动任务
→ 一个正式分支
→ 一个长期Draft PR
→ 先读全部要求和全量代码完成整体规划
→ 按内部阶段连续实施
→ 每阶段原子提交、代码审计和回归
→ 全部完成后一次转Ready
→ 一次受控合并和整体Verified关闭
```

路线图：[`docs/roadmap/V1.0_ROADMAP.md`](./docs/roadmap/V1.0_ROADMAP.md)  
任务索引：[`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)  
需求追踪：[`docs/product/V1.0_TRACEABILITY_MATRIX.md`](./docs/product/V1.0_TRACEABILITY_MATRIX.md)

## 开发入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ M4-04唯一整体任务卡
→ 被吸收需求来源和专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

当前活动任务：

[`M4-04 WorldForge V1剩余功能整体实施与发布闭环`](./docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)

自动化规范：[`docs/process/DEVELOPMENT_AUTOMATION.md`](./docs/process/DEVELOPMENT_AUTOMATION.md)

## 发布工具

发布配置使用GitHub Actions手工触发，默认创建Draft Release。发布前可在本地检查配置：

```bash
pnpm release:check
```

真实发布只允许从`main`执行。M4-04未Verified或P0、跨平台、数据安全与恢复门未关闭时，发布入口必须明确失败，不能提前分发未完成版本。

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
