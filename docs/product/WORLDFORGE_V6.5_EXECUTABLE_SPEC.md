# WorldForge V6.5 可执行总规格

> 状态：Frozen  
> 目标版本：V1.0核心写作闭环；V1.5超长篇增强  
> 用途：作为Codex可稳定检索的Markdown设计真源。完整DOCX保留用于产品阅读与归档；工程实现以本文件和链接的专项冻结规格为准。

## 1. 产品定义

WorldForge是面向单作者长篇网文创作的本地优先桌面工作站。

核心定位：

```text
作者定义世界、人物、结构、文风与边界
→ AI生成可选候选
→ 作者比较、融合、修改和裁决
→ 系统维护版本、连续性、检索和恢复
```

产品不替代作者，不把AI文本自动视为正文，不建设云端作品平台。

## 2. 不可变原则

### INV-001 本地数据

正文、设定、索引、日志、备份、Prompt、评测和项目配置保存在用户本机。外部AI请求由本地Core直接发送到用户配置的端点。

### INV-002 Candidate隔离

AI结果必须先成为Candidate。未经作者明确接受，不能写入活动Draft。

### INV-003 SQLite唯一真源

`project.sqlite`是项目唯一权威数据源。Renderer状态、Tiptap JSON、FTS、摘要、日记、缓存和导出文件均是派生或交付副本。

### INV-004 代码硬约束

项目边界、路径边界、锁定块、Revision、Hash、不可变Version和事务由代码保证。Prompt不是安全控制。

### INV-005 作者裁决

AI可以提出正文、校验、状态变化、摘要和日记；不能直接修改Canon、定稿正文和权威状态。

## 3. V1.0范围

V1.0完成：

```text
项目创建与本地工作空间
→ 任务书、大纲、卷章、SceneBeat
→ 人物、地点、势力、规则、状态、时间线、知情、伏笔
→ 块级正文编辑、自动保存、锁定、撤销
→ Draft / Candidate / Version
→ Provider、约束包、T0/T1、快速和结构性改写、融合
→ Candidate Diff、冲突、采用和回退
→ 定稿、状态提案、尾快照、失效标记
→ 校验、搜索、替换、词典和修订待办
→ TXT/Markdown/DOCX导入导出
→ 回收站、三轨备份和恢复副本
→ 新手/专业模式、沉浸写作、2K/21:9/混合DPI
```

## 4. V1.0不做

- 云存储、云同步、账号后台、作品托管。
- WorldForge模型请求中转。
- 本地模型下载、安装、升级、容器、显存和进程管理。
- 向量数据库、Embedding、Rerank和预建检索Adapter。
- MCP、CRDT、多人实时协作、插件市场。
- 自动发布、平台登录、读者反馈运营系统。
- 自动学习作者偏好。
- 无人审核批量生成。
- 社区、成就、商业运营后台。

## 5. V1.5边界

满足V1.0稳定性与真实长篇评测后，独立实施：

- L0—L5自动分层记忆调度。
- 卷级连续性检查点。
- AI项目日记与定时补执行。
- 300万—500万字完整压力适配。
- 经评测后决定是否增加语义检索。
- 可选项目数据库加密。

V1.5不得阻塞V1.0。

## 6. 总体架构

```text
Electron Main
  ├─ 窗口、生命周期、系统菜单、文件选择器
  ├─ 显示器与DPI恢复
  ├─ OS Credential Store代理
  └─ Core Utility Process监管

Preload
  ├─ window.worldforge具名白名单
  ├─ Zod边界校验
  └─ MessagePort流式桥接

Renderer
  ├─ React + TypeScript
  ├─ Tiptap + ProseMirror
  ├─ Zustand临时UI状态
  └─ 页面、编辑器和流式预览

Core Service Utility Process
  ├─ Command Router与Use Case
  ├─ SQLite、Migration、Repository和单写队列
  ├─ 文件、FTS5、导入导出、备份恢复
  ├─ Provider、约束包、Prompt和Candidate
  ├─ 校验、任务和事件
  └─ CPU密集任务调度
```

专项依据：

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/DATA_FLOW.md`

## 7. 技术栈

| 层级 | 冻结技术 |
|---|---|
| 桌面壳 | Electron |
| UI | React + TypeScript + Vite |
| 编辑器 | Tiptap + ProseMirror |
| 状态管理 | Zustand |
| 数据库 | SQLite + better-sqlite3 |
| 全文检索 | SQLite FTS5 |
| 契约 | Zod + JSON Schema |
| IPC | Electron IPC + MessagePort |
| 测试 | Vitest + Playwright |
| Monorepo | pnpm workspace |
| 打包 | electron-builder |
| 基础组件 | Radix UI，视觉遵守WorldForge Token |
| 日志 | 本地结构化日志 |
| 密钥 | OS Credential Store |

生产依赖新增必须明确理由、维护状态、体积、许可证与替代方案，并获得批准。

## 8. 仓库结构

```text
apps/desktop/
├─ main/
├─ preload/
└─ renderer/

packages/
├─ contracts/
├─ domain/
├─ core-service/
├─ editor-core/
├─ prompts/
└─ testkit/

migrations/
├─ app/
└─ project/

tests/
evals/
docs/
scripts/
```

## 9. 数据权威

| 数据 | 权威来源 |
|---|---|
| 应用设置、最近项目、Provider元数据 | `app.sqlite` |
| 项目正文、版本、设定、状态、候选和备份记录 | `project.sqlite` |
| API密钥 | OS Credential Store |
| 编辑器文档 | DraftBlock的临时视图 |
| FTS、统计、摘要、日记和缓存 | 派生数据，可重建 |
| 导出文件 | 交付副本 |

数据库和字段依据：

- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`

## 10. Project与规划

### Project

每部作品对应独立工作空间和`project.sqlite`。

### ProjectBrief

最小任务书保存：

- 一句话核心。
- 阅读承诺。
- 主角目标。
- 核心冲突。
- 终局方向。
- 必须兑现与禁止内容。

除项目名和有效路径外，V1.0不强制填写规划字段。

### Volume、Chapter、PlotNode、SceneBeat

- Volume组织卷。
- Chapter管理章节生命周期和活动Draft。
- PlotNode表达卷、剧情弧和章节规划。
- SceneBeat表达章节内目标、冲突、信息、结果和场景类型。

规划变化不自动改正文。删除SceneBeat不删除正文。

## 11. 实体、Canon与连续性

### Entity

统一管理人物、地点、势力、道具、能力、规则、事件和自定义对象。

### CanonFact

作者确认的稳定事实。AI无直接写入接口。

### EntityState

随剧情变化的状态，具备：

- stateKey。
- value。
- validFrom / validUntil。
- current / historical / superseded / invalid。
- evidence。

### TimelineEvent

保存事件起止、精度、地点、参与者和依赖。

### KnowledgeState

状态：

```text
knows | believes | suspects | misunderstands | unknown
```

### Foreshadowing

生命周期：

```text
planned → planted → reinforced → partially_revealed → revealed
                                  └→ cancelled
```

### EndingSnapshot

章节定稿后生成的最小连续性入口。旧章返修使相关派生快照和校验标记stale，但不自动改写后文。

## 12. Draft、Block、Candidate与Version

### Draft

每章最多一个活动Draft，可编辑。

### DraftBlock

V1块类型：

```text
paragraph | dialogue | heading | separator
```

属性：

- `logicalBlockId`
- source：manual / ai / mixed / imported
- locked
- contentHash
- orderKey

### Revision

每个成功的Draft Patch事务递增一次Revision。Revision不是完整快照。

### Candidate

类型：skeleton / full / rewrite / merge。

状态：pending / accepted / discarded。

完整度：complete / partial。

### Version

不可变快照。恢复Version时生成新Draft，不修改旧Version。

### Candidate采用

必须检查：

- projectId。
- baseRevision。
- expectedHash。
- locked block。
- Candidate状态和完整度。

采用在一个事务中执行，并保存ApplyRecord和回退依据。

## 13. 编辑器

核心能力：

- 中文IME稳定输入。
- Block Patch。
- 800ms空闲自动保存。
- 撤销重做。
- 粘贴清理。
- 当前章查找替换。
- 锁定段落。
- 来源模式。
- SceneBeat关联。
- 沉浸写作。

专项依据：`docs/ui/EDITOR_INTERACTION_SPEC.md`。

## 14. AI接入

Provider只负责协议转换，不访问项目数据库。

V1能力字段：

```ts
streaming: boolean
structuredOutput: boolean
maxContextTokens: number
maxOutputTokens: number
```

支持：

- OpenAI兼容协议。
- Anthropic协议。
- 仓库内明确实现并测试的Custom适配器。

本地模型服务由用户自行运行。WorldForge只连接，不管理运行时。

专项依据：

- `docs/ai/LOCAL_AI_SERVICE_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`

## 15. 约束包

优先级：

```text
P0 代码硬约束
P1 本章必须事件、SceneBeat和前章尾状态
P2 相关Canon、当前状态、知情和伏笔
P3 文风、角色声音和表现要求
P4 可裁剪辅助背景
```

组装流程：

1. 读取当前章节和SceneBeat。
2. 读取前章有效EndingSnapshot。
3. 读取相关实体当前状态。
4. 读取知情和伏笔。
5. 使用确定性关联与FTS5召回补充内容。
6. 时序过滤、去重和冲突标记。
7. 估算Token并按P4→P3→低相关P2裁剪。
8. 计算constraintHash并记录来源。

V1不使用向量检索。

## 16. AI任务

### T0骨架

- 生成多个结构化骨架Candidate。
- 每个SceneBeat提供事件、因果、信息和钩子。
- 作者可选、改、融合或绕过T0。

### T1扩写

- 基于选定骨架和约束包生成完整Candidate。
- 流式结果仅临时展示。
- 完成后一次保存Candidate。

### 快速改写

- 单自然段内联预览。
- 应用前不改原文。
- 主要操作不超过2次点击。
- 应用后可立即撤销。

### 结构性改写

跨段、跨SceneBeat、整章或大幅结构变化必须进入完整Candidate审阅。

### 融合

按SceneBeat或“结构来源/表达来源”生成新的merge Candidate，仍需审阅。

## 17. 流式任务

真实阶段：

```text
queued
assembling_constraints
calling_model
receiving_output
parsing_output
saving_candidate
validating_candidate
completed
```

规则：

- delta按20—50ms或字符阈值批量。
- sequence单调递增。
- 页面切换不取消、不串任务。
- 取消反馈目标≤500ms。
- 断流和取消可保存partial Candidate。
- 不伪造倒计时和百分比。

## 18. Candidate审阅

视图：

- 双栏。
- 上下。
- 单稿。
- 只看差异。

Diff顺序：

1. logicalBlockId结构匹配。
2. 新增、删除、移动、拆分、合并。
3. 中文字符Diff。

采用单位：整稿、SceneBeat、完整Block。V1不支持逐字符拼接采用。

专项依据：`docs/ui/CANDIDATE_REVIEW_SPEC.md`。

## 19. 定稿与状态提案

```text
Draft
→ 创建final Version
→ 规则或AI生成StateProposal
→ 作者接受、编辑后接受或拒绝
→ 更新EntityState
→ 创建EndingSnapshot
```

pending提案不改变权威状态。静态Canon变化只能提示作者核对。

## 20. 校验

### 确定性

- 必选SceneBeat。
- 时间顺序。
- 引用完整性。
- 锁定与结构规则。

### 统计

- 字数、句长、段长。
- 对话、动作、描写比例。
- 重复标点和专名。

### AI语义

- 人物行为风险。
- 设定偏离。
- 前后衔接。
- 文风和信息倾泻。

AI校验只生成风险提示，可忽略、静音、降级和标记误报。

## 21. 搜索与修订

- 当前章查找替换。
- FTS5全项目搜索。
- Version、实体和笔记检索。
- 批量替换先预览ReplacePlan。
- 提交前重新检查Revision、Hash和锁定。
- 高风险替换前创建恢复点。
- 校验问题可转StoryTodo。

## 22. 导入导出

### 导入

- TXT：UTF-8、UTF-16、GB18030候选，低置信度人工选择。
- Markdown：基础标题和段落。
- DOCX：只提取允许内容，限制大小、文件数、压缩比和路径，忽略宏、OLE和外部资源。
- 先生成ImportPlan，作者调整后一次事务提交。

### 导出

- 从选定Version导出。
- 格式：TXT、Markdown、DOCX。
- 临时文件写入、验证、原子重命名。

## 23. 备份与恢复

三轨：

1. 日常滚动备份。
2. Migration、导入、替换、拆并章前的重大恢复点。
3. 作者命名手动快照。

使用SQLite Online Backup，完成后进行完整性检查和Hash。最后一份已验证备份不得自动删除。

恢复默认到新目录，原项目不覆盖。

## 24. UI架构

一级入口：

```text
首页 | 规划 | 写作 | 设定 | 检查 | 设置
```

三个核心工作台：

- 规划工作台。
- 写作工作台。
- 检查与交付工作台。

新手和专业模式共用数据，只改变信息披露。沉浸写作是视图状态。

完整UI依据：`docs/ui/README.md`。

## 25. 高分屏与显示

- 1280×800保证核心流程。
- 2560×1440的100%、125%、150%为重点环境。
- 21:9支持工作区居中、偏左、偏右。
- 正文版心680/760/860 CSS px，最大不超过860px。
- 混合DPI使用DIP窗口坐标恢复。
- 无整页水平滚动。

## 26. 安全与隐私

Electron要求：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

- Preload只暴露具名方法。
- Renderer无Node、文件、SQLite和凭据能力。
- 严格CSP，阻止应用内远程导航。
- 路径归一化并限制项目或用户明确选择目录。
- 凭据只在系统凭据库和请求内存中。
- 默认日志不保存正文、完整Prompt和密钥。

## 27. 性能预算

| 指标 | V1目标 |
|---|---:|
| 2K键入P95 | ≤50ms |
| 自动保存P95 | ≤150ms |
| 编辑IPC P95 | ≤200ms |
| AI取消反馈 | ≤500ms |
| 5000字Diff首屏 | ≤500ms |
| 5000字完整Diff | ≤1.2s |
| 正文滚动 | ≥50fps |
| Core连续阻塞 | <100ms |

达到拆分阈值后才评审独立AI进程。

## 28. 测试体系

- 单元测试。
- Repository与SQLite集成测试。
- IPC集成测试。
- Migration测试。
- Electron安全测试。
- Playwright桌面E2E。
- 性能测试。
- AI Eval。
- 高分屏、中文输入和无障碍人工验收。

代码硬保证失败时禁止发布：

- 锁定块被修改。
- 未确认Candidate写入Draft。
- Revision冲突静默覆盖。
- AI直接修改Canon或权威状态。
- 跨项目读写。
- 凭据进入数据库、Renderer或普通日志。
- 恢复覆盖原项目。

## 29. 开发路线

```text
M0 工程、安全、数据库、IPC和关键Spike
M1 编辑器、Draft、Candidate、Version和结构恢复
M2 规划、实体、状态、时间线、知情、伏笔和尾快照
M3 Provider、约束包、T0/T1、改写、Diff和采用
M4 校验、搜索、导入导出、备份和完整UI
M5 安全、性能、跨平台和P0发布验收
```

任务入口：

- `docs/tasks/ACTIVE_TASK.md`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M0_TASKS.md`至`M5_TASKS.md`

## 30. 实现时的文档路由

开始任何任务时，先读：

1. `AGENTS.md`
2. `docs/PROJECT_EXECUTION_ENTRY.md`
3. `docs/tasks/ACTIVE_TASK.md`
4. 本任务专项文档
5. 现有代码、测试和追踪矩阵

具体路由以`PROJECT_EXECUTION_ENTRY.md`为准。

## 31. 完成定义

功能只有同时满足以下条件才算完成：

- 真实实现已接通。
- 成功、失败、取消、冲突路径存在。
- 必要测试真实运行并通过。
- 数据、IPC、UI、安全和文档保持一致。
- 追踪矩阵更新。
- 证据写入`docs/test-evidence/<TASK-ID>/`。
- 无TODO、空实现、固定假数据和伪造成功。

## 32. 详细规格索引

- 功能：`docs/product/FUNCTION_CATALOG.md`
- 架构：`docs/architecture/`
- 数据库：`docs/database/`
- IPC：`docs/contracts/`
- AI：`docs/ai/`
- UI：`docs/ui/`
- 安全：`SECURITY.md`、`docs/security/`
- 测试：`docs/testing/`
- 任务：`docs/tasks/`
- ADR：`docs/decisions/`
