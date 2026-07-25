# WorldForge V6.5 完整产品与技术规格

> 状态：Frozen  
> 目标版本：V1.0核心写作闭环；V1.5超长篇增强  
> 更新日期：2026-07-25

## 1. 文档职责与唯一真源

本文件定义产品定位、V1.0功能边界、总体架构、核心数据关系和不可变原则。

为避免同一内容在多处重复维护，以下专项内容分别以对应文档为唯一真源：

| 内容 | 唯一真源 |
|---|---|
| V1.0/P1/V1.5范围 | `V1_SCOPE_AND_ACCEPTANCE.md` |
| 功能ID和功能关系 | `FUNCTION_CATALOG.md` |
| 任务阶段、编号和依赖 | `V1_TASK_SYSTEM_REBASE.md`、`../tasks/TASK_INDEX.md` |
| P0验收编号和通过标准 | `../testing/P0_ACCEPTANCE_MATRIX.md` |
| 数据表、字段和事务 | `../database/DATABASE_SCHEMA.md` |
| IPC、事件和错误码 | `../contracts/` |
| Prompt、Provider和Eval | `../ai/` |
| UI、主题、交互和显示 | `../ui/` |
| 冻结技术选择 | `../decisions/IMPLEMENTATION_DECISIONS.md`与ADR |

本文件不复制任务卡明细或P0验收表。专项文档不得改变本文件的产品原则；专项实现细节发生冲突时，以对应唯一真源为准并同步追踪矩阵。

## 2. 产品定位

WorldForge是面向单个作者的本地优先桌面长篇写作工作站。

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

产品目标：

1. 无AI时仍是一款完整、可靠的本地写作软件。
2. AI正文只生成可拒绝、可比较、可撤销的Candidate；状态变化只生成待确认StateProposal。
3. 正文、设定、状态、版本和备份全部保存在用户本机。
4. 长篇创作中的卷章、场景、人物状态、知情、伏笔、人物弧光和时间线可持续维护。
5. 任何自动能力不能绕过作者裁决和数据安全边界。

## 3. 本地与AI边界

AI接入只允许：

1. 本地应用直接调用用户自行配置的外部模型API。
2. 本地应用连接用户已经运行的本地或可信局域网兼容服务。

WorldForge不建设：

- 云存储、云同步、账号后台或作品托管。
- 自有云端AI服务或模型请求中转。
- 模型下载、安装、升级和运行时监管。
- 多人协作、CRDT、插件市场、社区和运营后台。
- 无人审核批量生成与自动发布。

## 4. 五项核心不变量

1. 项目数据默认只在用户本机。
2. AI正文输出必须先成为Candidate，状态变化必须先成为pending StateProposal，均不能直接进入权威数据。
3. 每项目`project.sqlite`是项目唯一权威数据源；`app.sqlite`只保存应用级信息。
4. 锁定、Revision、SHA-256内容Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有正文、Canon、动态状态、弧光节点和定稿的最终裁决权。

以下指标必须保持为0：

- 锁定块被AI、替换或结构操作修改。
- 未确认Candidate写入活动Draft。
- Skeleton Candidate进入正文Diff、Apply、Version或定稿。
- partial Candidate被默认整稿采用或直接定稿。
- Revision或Hash冲突被静默覆盖。
- AI直接写入Canon、EntityState、ArcMilestone或EndingSnapshot权威状态。
- pending StateProposal被后续功能当作已确认事实。
- 跨项目读写成功。
- 凭据进入项目数据库、Renderer、普通配置或日志。
- 恢复操作覆盖原项目。

## 5. V1.0完整功能

### 5.1 应用与基础写作

- Electron安全应用壳、Core Utility Process监管和单实例。
- 应用设置、最近项目、新建、打开、关闭、移动和重新定位。
- 项目损坏、Schema过新或完整性异常时只读打开。
- 卷与章节新增、重命名、排序、移动、状态、目标字数、软删除和恢复。
- Tiptap块级正文、中文IME安全、粘贴清理、撤销重做。
- 800ms空闲自动保存、保存失败持续提示、统一字数和当前章查找。
- TXT/Markdown基础导入导出、手动Version、章节定稿和历史恢复。
- 基础恢复点、完整性检查和恢复到新副本。

M1完成时必须形成无AI可长期使用的基础写作产品。

### 5.2 编辑安全与版本

- Draft、Candidate、Version三层正文模型。
- Candidate按内容类型区分结构化Skeleton与Prose Candidate；`candidate_blocks`只承载Prose正文。
- `logicalBlockId`、有序Block Patch、baseRevision和expectedHash。
- UI与Core双层锁定。
- 中文结构Diff和字符Diff。
- 原子采用、ConflictSet、ApplyRecord、持久化回退。
- 回收站、拆章、并章、跨章移动和高风险操作恢复点。
- Version不可变；恢复历史Version时创建新Draft。

### 5.3 规划、设定与连续性

- ProjectBrief作品任务书、大纲树和SceneBeat。
- 人物、地点、势力、道具、能力、规则、事件和自定义实体。
- 静态Canon与动态EntityState分离。
- 时间线、人物知情信息和伏笔生命周期。
- CharacterArc与ArcMilestone，支持成长、黑化、觉醒、堕落、救赎和自定义类型。
- 弧光节点状态为`planned/hit/skipped`，命中必须经StateProposal确认。
- 状态提案、章节尾快照和旧章返修失效传播。
- 规划变化只产生影响提示，不自动修改正文。

### 5.4 AI基础设施

- OpenAI兼容、Anthropic和仓库内批准的Custom适配器。
- Electron `safeStorage`调用可用的OS安全加密后端，密文保存到权限受限的本地凭据文件，数据库只保存`credentialRef`；不安全后端直接阻断。
- FTS5公共索引、项目词典和可重建索引队列。
- P0—P4约束包、时序过滤、来源追溯、Token估算与裁剪。
- 在M0-07 Spike基础上生产化版本化Prompt Registry、严格输入输出Schema、受控Cleaner和Parser。
- 复用M0-04 TaskProtocol建立GenerationRun、真实阶段、MessagePort流式、取消、错误映射、partial Candidate和重启后持久化查询。
- GenerationRun记录Prompt版本、ConstraintPackage来源、裁剪日志、Provider、Model、usage、错误和结果引用。
- ModelSupportProfile按`Provider + Model + Task + PromptVersion`记录支持等级。

### 5.5 AI写作与候选审阅

- T0生成多个结构化Skeleton Candidate，可编辑、可比较、可绕过，禁止进入正文Apply。
- T1支持三种输入来源：选定Skeleton Candidate、权威SceneBeat或直接章节目标。
- T1优先纯文本流，完成后保存Prose Candidate；结构化长正文只对已验证模型启用。
- 单段快速改写和跨段结构性改写均先形成持久化Candidate。
- 多候选按SceneBeat融合并生成新的merge Candidate。
- 双栏、上下、单稿和只看差异。
- 整稿、块级和SceneBeat级采用。
- 锁定、Revision、Hash和项目范围冲突处理。
- 取消或断流后可选择保存partial Candidate；partial不能默认整稿采用或直接定稿。
- 候选审阅显示GenerationRun、Prompt版本、约束来源和完整度。
- Final Version可通过真实`state_extract` GenerationRun生成pending StateProposal；作者接受、编辑接受或拒绝后才更新权威状态和EndingSnapshot。

### 5.6 校验、搜索和连载建议

- 确定性校验、统计校验和AI语义风险提示。
- AI语义与人物弧光校验只读取已确认状态，不读取pending StateProposal作为事实。
- StoryTodo与Comment修订闭环。
- 全项目FTS5搜索覆盖活动Draft、只读Version和Entity。
- 安全批量替换只作用于活动DraftBlock；Version不可变，Entity通过专用设定命令修改。
- 人物弧光一致性校验。
- 爽点密度、章末钩子、人工写作统计、更新节奏和黄金三章建议。
- 人工写作统计排除AI采用、导入、批量替换、恢复、结构操作和系统维护。
- 所有节奏指标为P3建议级，可关闭，不阻断生成、保存或定稿。

### 5.7 导入、导出和恢复

- TXT、Markdown和DOCX安全导入预览，DOCX扩展现有ImportPlan和提交协调器。
- TXT、Markdown和DOCX从指定Version导出。
- 日常滚动、重大操作和手动命名快照三轨备份，统一复用现有RecoveryService、验证和文件格式。
- 最后一份已验证备份、永久恢复点和作者保留快照受保护。
- 默认恢复到新目录，原项目保持不变。
- 安全空间清理和回收站永久删除影响预览。

### 5.8 UI、主题和显示

- 新手/专业模式共用数据与Use Case，只改变信息披露，并使用单一权威状态源。
- M5-00完成作者语言、继续写作、基础导航、正文中心布局、侧栏折叠、沉浸状态和高风险操作可视化。
- M7-01在M5-00基础上完成快速开始、完整流程、导入、空白项目和自主/混合/AI初稿三条路径。
- M7-02将候选、校验、搜索、导入导出和恢复接入统一工作台，补齐StatusArbiter、帮助和返回原位置。
- 首页支持真实继续写作，恢复最近项目、章节、光标和滚动位置；持久化状态不保存正文内容。
- 普通作者界面使用作者语言，工程术语集中到高级诊断和技术详情。
- 正文为写作工作台默认视觉中心，侧栏可折叠，沉浸写作为视图状态。
- 拆章、并章和跨章移动使用可视化影响预览，不要求用户输入内部块序号。
- 常用设定使用中文结构化表单，普通模式不要求输入JSON或内部事实键。
- Theme A“安静编辑部”：浅色、深色、护眼和高对比。
- Theme B“水墨印章”：浅色、深色和成功后印章表现层。
- 主题只影响Design Token、资源和动画，不改变业务命令与状态机，也不建立第二套Theme状态源。
- 支持1280×800、2K 100/125/150%、21:9和混合DPI。
- 核心流程支持键盘、焦点、读屏、减少动态和非颜色状态表达。

## 6. P1与V1.5边界

V1.0 P1和V1.5延期项以`V1_SCOPE_AND_ACCEPTANCE.md`为准。

当前原则：

- P1不能阻塞V1.0 P0发布。
- V1.5不在V1.0任务中提前建设。
- 研究笔记、项目日记、L0—L5自动记忆、卷级检查点、定时调度、语义向量检索和300万—500万字专项适配均需独立立项。

## 7. 总体架构

```text
Electron Main
  窗口、生命周期、OS集成、凭据Broker、Core监管

Preload
  具名白名单、边界Schema校验、MessagePort桥

Renderer
  React、Tiptap、Zustand、交互和临时流展示
  禁止Node、SQLite、文件、环境变量和凭据

Core Service Utility Process
  唯一SQLite写者、文件、FTS、Provider、校验、导入导出、备份恢复
```

Core初期保持单一Utility Process。网络任务异步运行，SQLite业务写入串行；CPU任务超过事件循环预算时使用Worker或分片。只有量化性能证据达到门槛时才评审拆进程。

## 8. 仓库结构

```text
apps/desktop/main
apps/desktop/preload
apps/desktop/renderer
packages/contracts
packages/domain
packages/core-service
packages/editor-core
packages/prompts
packages/testkit
migrations/app
migrations/project
tests
evals
docs
scripts
```

## 9. 核心数据关系

```text
app.sqlite
├─ app_settings
├─ recent_projects
└─ provider_configs

project.sqlite
├─ Project / Volume / Chapter / ProjectBrief / PlotNode / SceneBeat
├─ Draft / DraftBlock / Candidate / SkeletonPayload / CandidateBlock / Version / ApplyRecord
├─ Entity / CanonFact / EntityState / StateProposal
├─ Timeline / Knowledge / Foreshadowing / CharacterArc / ArcMilestone
├─ EndingSnapshot / ValidationIssue / StoryTodo / Comment
├─ GenerationRun / ConstraintPackage / ModelSupportProfile
├─ GenreRhythmProfile / WritingSession / ProjectDictionary / FTS索引队列
└─ BackupRecord / TrashEntry / ProjectSetting / MigrationJournal
```

AI不会直接写当前稿：

```text
ConstraintPackage
→ GenerationRun
→ 临时流展示
→ Prose Candidate
→ Diff与冲突检查
→ 作者选择
→ Block Patch
→ Draft Revision +1
```

状态和弧光不会被AI直接推进：

```text
定稿Version
→ state_extract GenerationRun
→ pending StateProposal(entity_state或arc_milestone)
→ 作者接受/编辑/拒绝
→ 单事务更新权威状态
→ EndingSnapshot
```

## 10. 数据和事务规则

- `app.sqlite`只保存应用设置、最近项目、Provider元数据和UI偏好。
- `project.sqlite`保存项目权威数据。
- 所有业务ID使用小写带连字符UUID。
- 所有`order_key`使用64位整数间隔键，初始间隔1024。
- 所有持久化时间使用UTC ISO-8601毫秒字符串。
- 所有业务写入通过Core单写队列。
- Draft Patch、Candidate采用、Version创建、StateProposal批次创建与解决、结构操作、导入和Migration必须单事务。
- GenerationRun成功与Candidate或StateProposal结果引用必须原子收口。
- 高风险操作调用统一恢复点。
- FTS、统计、摘要和缓存属于可重建派生数据。
- 人工写作统计必须有明确`mutationOrigin`或独立WritingSession来源，不从无来源Patch日志推断。

## 11. AI、Prompt和模型规则

- Prompt必须有稳定`promptId`和整数`version`。
- Prompt Registry、Cleaner和Parser只在`packages/prompts`维护，并承接M0-07既有Spike资产。
- GenerationRun记录`promptId`、`promptVersion`、`constraintHash`、实际约束来源、裁剪日志和实际模型。
- T1输入为Skeleton Candidate、权威SceneBeat或直接章节目标三种来源的显式联合，禁止伪造SceneBeat。
- T1优先纯文本流；结构化长正文仅对稳定模型启用。
- Cleaner只移除登记的协议外壳，不猜测改写无效JSON。
- `state_extract`输出对齐StateProposalDraft合同；`previousValue`由Core计算，结果只进入pending提案。
- 模型支持等级与Provider、Model、Task、Prompt版本绑定。
- 模型质量不达标时降级或绕过，不降低代码硬保证。

## 12. UI实施规则

- 每张用户功能任务同时完成最小可操作UI。
- M5-00在面向用户的AI生成入口前完成现有作者工作流基础体验收口。
- M7-01负责完整向导和三条创作路径；M7-02负责M6功能接入后的统一工作台、状态仲裁和帮助；M7不重建M5-00基础骨架。
- 新手/专业模式共用数据和命令，并使用单一权威模式状态源。
- Theme A/Theme B共用业务组件、状态机和Appearance状态源。
- 页面必须覆盖空、加载、成功、失败、取消、冲突、只读和恢复。
- 正文始终是写作工作台视觉中心。
- 普通界面优先说明用户影响和处理动作，工程诊断信息按需披露。

## 13. 安全与隐私

- Renderer无Node、文件、数据库、环境变量和凭据能力。
- Preload只暴露具名白名单方法，输入输出使用strict Schema。
- Core验证项目ID、实体归属、Candidate类型、Final Version、真实路径和符号链接边界。
- DOCX在隔离临时目录解析，限制数量、大小、压缩比和外部资源。
- 凭据由Electron `safeStorage`安全后端加密，密文文件使用受限权限；`basic_text`等不安全后端必须阻断。
- 普通日志不记录正文、完整Prompt、约束全文、原始模型响应和凭据。
- 继续写作状态只保存项目、章节、光标和滚动等最小信息，不保存正文或选区文本。
- 外部Provider由用户主动配置，界面明确本机、局域网和外部端点边界。

## 14. 性能基线

| 指标 | V1目标 |
|---|---:|
| 2K键入P95 | ≤50ms |
| 自动保存事务P95 | ≤150ms |
| 编辑IPC P95 | ≤200ms |
| AI取消反馈 | ≤500ms |
| 5000字Diff首屏 | ≤500ms |
| 5000字完整Diff | ≤1.2s |
| 正文滚动 | ≥50fps |
| Core单次事件循环阻塞 | <100ms |

完整性能预算以`../testing/PERFORMANCE_BUDGETS.md`为准。

## 15. 验收与发布

P0验收项以`../testing/P0_ACCEPTANCE_MATRIX.md`中的`P0-001—P0-075`为唯一编号体系。

发布必须满足：

1. P0功能真实接通，不能以Mock、TODO、空实现或固定成功代替。
2. 数据安全、恢复、Candidate隔离、Skeleton类型守卫、partial限制、锁定、Revision和项目边界全部通过。
3. GenerationRun、Candidate、StateProposal、Prompt和ConstraintPackage引用完整；取消与重启状态真实。
4. `state_extract`只创建pending StateProposal，AI直接写权威状态的成功次数为0。
5. 人工写作统计排除AI、导入、替换、恢复、结构和系统操作。
6. 单元、Repository、集成、Migration、安全、桌面E2E、性能和AI Eval证据完整。
7. 1280×800、2K、21:9、混合DPI及冻结主题范围通过UI验收。
8. 模型质量未达标时，对应AI任务降级；无AI基础写作闭环必须仍可发布。

## 16. V1.0任务路线

V1.0采用M0—M8九阶段，共54张独立任务卡：

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与AI基础设施
→ M5 作者体验、AI生成候选与状态提取
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

M5-00是M5-01的硬依赖，负责在T0/T1界面接入前关闭现有作者工作流的P0体验缺口。M5-06在M5候选审阅之后补齐真实Provider状态提取与StateProposal接线，M6-02依赖其已确认状态闭环。

已完成任务卡及证据保持冻结；后续发现的扩展和整改由未完成任务承接。

详细编号、依赖和状态只在`../tasks/TASK_INDEX.md`维护。

## 17. 开发入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项唯一真源
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.md`为`NO_ACTIVE_CODING_TASK`时，不得自行开始生产代码任务。
