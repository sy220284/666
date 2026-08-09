# WorldForge V6.5 完整产品与技术规格

> 状态：Frozen Baseline with M10-21 Current Authority Addendum
> 目标版本：V1.0核心写作闭环；V1.5超长篇增强  
> 更新日期：2026-08-09

## 1. 文档职责与唯一真源

本文件定义产品定位、V1.0功能边界、总体架构、核心数据关系和不可变原则。

| 内容                             | 唯一真源                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| V1.0/P1/V1.5范围                 | `V1_SCOPE_AND_ACCEPTANCE.md`                                         |
| 功能ID和功能关系                 | `FUNCTION_CATALOG.md`                                                |
| 当前任务编号、静态状态和吸收关系 | `../tasks/TASK_INDEX.md`、`../tasks/runtime/`                        |
| 有效任务状态、分支与PR授权       | `../tasks/TASK_AUTHORIZATION.json`、`../PROJECT_EXECUTION_ENTRY.md`  |
| 历史任务收口过程                 | `V1_TASK_SYSTEM_REBASE.md`                                           |
| 当前维护任务                     | 从开放`work → main` PR marker或最新Runtime动态解析，禁止在本文件固化 |
| P0验收编号和通过标准             | `../testing/P0_ACCEPTANCE_MATRIX.md`                                 |
| 数据表、字段和事务               | `../database/DATABASE_SCHEMA.md`                                     |
| IPC、事件和错误码                | `../contracts/`                                                      |
| Prompt、Provider和Eval           | `../ai/`                                                             |
| UI、主题、交互和显示             | `../ui/`                                                             |
| 冻结技术选择                     | `../decisions/IMPLEMENTATION_DECISIONS.md`与ADR                      |

专项文档不得改变本文件的产品原则。代码、专项规格与本文件发生冲突时，必须通过新的独立任务同步修正实现、测试、追踪和Evidence。

## 2. 产品定位

WorldForge是面向单个作者的本地优先桌面长篇写作工作站。

```text
作者导演
→ 规划与设定
→ 基础正文写作
→ AI建议生成
→ 比较、融合与采用
→ 定稿与状态确认
→ 连续性维护
→ 作品检查、搜索、导出与恢复
```

产品目标：

1. 无AI时仍是一款完整、可靠的本地写作软件。
2. AI正文只生成可拒绝、可比较、可撤销的建议稿；状态变化只生成待确认设定更新建议。
3. 正文、设定、状态、历史版本和备份全部保存在用户本机。
4. 长篇创作中的卷章、场景、人物状态、知情、伏笔、人物弧光和时间线可持续维护。
5. 自动能力不得绕过作者裁决和数据安全边界。

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
2. AI正文输出必须先成为建议稿；AI或规则推导的状态变化必须先成为pending设定更新建议。作者可通过受控领域命令直接裁决权威状态。
3. 每项目`project.sqlite`是项目唯一权威数据源；`app.sqlite`只保存应用级信息。
4. 锁定、保存序号、SHA-256内容Hash、不可变历史版本、项目与路径边界由代码保证。
5. AI只能提议，作者拥有正文、已确认设定、动态状态、弧光节点和定稿的最终裁决权。

以下指标必须保持为0：

- 锁定正文块被AI、替换或结构操作修改。
- 未确认建议稿写入活动当前稿。
- 情节骨架进入正文差异、采用、历史版本或定稿。
- 未完成建议稿被默认整稿采用或直接定稿。
- 保存序号或Hash冲突被静默覆盖。
- AI直接写入已确认设定、动态状态、弧光里程碑或章节尾快照。
- pending设定更新建议被后续功能当作已确认事实。
- 跨项目读写成功。
- 凭据进入项目数据库、Renderer、普通配置或日志。
- 恢复操作覆盖原项目。

## 5. V1.0完整功能

### 5.1 应用与基础写作

- Electron安全应用壳、Core Utility Process监管和单实例。
- 应用设置、最近作品、新建、打开、关闭、移动和重新定位。
- 项目损坏、Schema过新或完整性异常时只读打开。
- 卷章新增、重命名、排序、移动、状态、目标字数、软删除和恢复。
- Tiptap块级正文、中文输入安全、粘贴清理、撤销重做。
- 800ms空闲自动保存、保存失败持续提示、统一字数和当前章查找。
- TXT/Markdown基础导入导出、手动历史版本、章节定稿和历史恢复。
- 基础恢复点、完整性检查和恢复到新副本。

### 5.2 编辑安全与历史版本

- 当前稿、建议稿、历史版本三层正文模型。
- 情节骨架与正文建议稿使用判别式合同；骨架不承载正文块。
- 稳定正文块标识、有序正文补丁、基础保存序号和预期Hash。
- UI与Core双层锁定。
- 中文结构差异和字符差异。
- 原子采用、冲突集、应用记录和持久化回退。
- 回收站、拆章、并章、跨章移动和高风险操作恢复点。
- 历史版本不可变；恢复时创建新当前稿。

### 5.3 规划、设定与连续性

- 作品任务书、大纲树和场景节拍。
- 人物、地点、势力、道具、能力、规则、事件和自定义实体。
- 静态已确认设定与动态状态分离。
- 时间线、人物知情信息和伏笔生命周期。
- 人物弧光与弧光里程碑。
- 弧光节点可由作者直接裁决，或由作者接受pending设定更新建议；两条入口复用同一Arc/Timeline依赖策略并记录确认来源。
- 章节尾快照和旧章返修失效传播。
- 规划变化只产生影响提示，不自动修改正文。

### 5.4 AI基础设施

- OpenAI兼容、Anthropic和仓库内批准的Custom适配器。
- Electron安全后端加密凭据；数据库只保存`credentialRef`。
- FTS5公共索引、作品词典和可重建索引队列。
- P0—P4约束包、时序过滤、来源追溯、Token估算与裁剪。
- 版本化Prompt Registry、严格输入输出Schema、受控Cleaner和Parser。
- `GenerationRun`持久化生成业务生命周期；`TaskProtocol/TaskSnapshot`投影真实阶段、流式进度、取消反馈和运行事件。取消、项目关闭、移动与Core关闭必须先收口GenerationRun，再等待实际执行静默。
- GenerationRun记录Prompt版本、约束来源、裁剪日志、Provider、Model、usage、错误和结果引用。

### 5.5 Provider资源边界

所有生产Provider调用经过有界Fetch：

| 范围                 | 默认上限 | 超限行为                                            |
| -------------------- | -------: | --------------------------------------------------- |
| 单次原始HTTP响应总量 |   16 MiB | 取消响应体或Reader，返回`AI_RESPONSE_TOO_LARGE_014` |
| 单个SSE事件          |    1 MiB | 在事件完成前停止读取，返回同一独立错误码            |

- 先检查有效`Content-Length`，再按实际流式字节累计。
- 无长度声明、跨分片和无事件分隔符仍受限制。
- 超限不得等待完整字符串或JSON缓冲后再检查。
- 超限不得保存完整建议稿、设定更新建议或原始响应正文。
- `AI_OUTPUT_INVALID_008`只表达输出Schema或业务内容无效。

### 5.6 AI写作与建议稿审阅

- T0生成多个结构化情节骨架，可编辑、比较和绕过，禁止进入正文采用。
- T1支持选定情节骨架、权威场景节拍或直接章节目标三种互斥来源。
- T1完成后保存正文建议稿。
- 快速改写和结构性改写均先形成持久化建议稿。
- 多建议稿支持场景节拍融合与受控片段融合。
- 建议稿按状态和类型分组，支持并排、行内、单稿、只看修改和长章节上下文折叠。
- 整稿、正文块和场景节拍级采用。
- 锁定、保存序号、Hash和项目范围冲突处理。
- 未完成建议稿不能默认整稿采用或定稿。
- 定稿历史版本可生成pending设定更新建议，作者裁决后才更新权威状态。

### 5.7 作品检查、搜索和连载建议

- 确定性校验、统计校验和AI语义风险提示。
- AI语义与人物弧光校验只读取已确认状态。
- 写作待办与批注修订闭环。
- 全项目全文搜索覆盖活动当前稿、只读历史版本和实体。
- 安全批量替换只作用于活动当前稿正文块。
- 爽点密度、章末钩子、人工写作统计、更新节奏和黄金三章建议。
- 人工写作统计排除AI采用、导入、批量替换、恢复、结构操作和系统维护。
- 所有节奏指标为P3建议级，可关闭，不阻断生成、保存或定稿。

### 5.8 搜索工具异步边界

检查页面维护四个独立Renderer请求通道：

```text
全文搜索
安全替换
作品词典
全文索引
```

- 同一通道后发请求使先发响应失效。
- 不同通道互不失效；词典写入不能锁死搜索或替换。
- 每个通道只清理自己的等待状态。
- 作品切换和页面卸载统一失效全部旧响应。
- 请求代次仅管理展示时序，不替代Core项目边界、锁定、恢复点和事务。

### 5.9 导入、导出和恢复

- TXT、Markdown和DOCX安全导入预览。
- TXT、Markdown和DOCX从指定历史版本导出。
- 日常滚动、重大操作和手动命名快照三轨备份。
- 最后一份已验证备份、关键Migration恢复点和作者保留快照受保护。
- 默认恢复到新目录，原项目保持不变。
- 安全空间清理和回收站永久删除影响预览。

### 5.10 UI、主题和显示

- 快速开始、完整流程、导入和空白项目四个入口。
- 自主、混合和AI优先三条创作路径。
- 统一规划、写作、设定、检查和交付工作台。
- 首页真实继续写作，不保存正文内容。
- 正文为默认视觉中心，侧栏可折叠，沉浸写作是视图状态。
- 本章写作辅助读取真实目标、场景节拍、人物状态、伏笔、待办和上一章结尾。
- 搜索、检查、待办、伏笔和场景节拍使用统一精准导航目标并恢复来源状态。
- 常用设定使用中文结构化表单和名称选择器。
- Theme A与Theme B共用业务组件和状态机。
- 支持1280×800、2K、21:9和混合DPI。
- 核心流程支持键盘、焦点、读屏、减少动态和非颜色状态表达。

### 5.11 安全关闭握手

关闭应用前，Main通过具名生命周期通道请求Renderer刷新当前稿：

- 请求和结果包含协议版本与UUID请求标识。
- Main只接受当前可信应用页面、匹配请求标识且通过strict Schema的首个结果。
- 保存失败、校验失败或超时都阻止静默退出。
- 监听器在完成、失败和超时后清理。

## 6. P1与V1.5边界

- P1不能阻塞V1.0 P0发布。
- V1.5不在V1.0任务中提前建设。
- 研究笔记、项目日记、L0—L5自动记忆、卷级检查点、定时调度、语义向量检索和超长篇专项适配均需独立立项。

## 7. 总体架构

```text
Electron Main
  窗口、生命周期、OS集成、凭据Broker、Core监管

Preload
  具名白名单、边界Schema校验、MessagePort与生命周期桥

Renderer
  React、Tiptap、Zustand、交互和临时流展示
  禁止Node、SQLite、文件、环境变量和凭据

Core Service Utility Process
  唯一SQLite写者、文件、全文搜索、Provider、校验、导入导出、备份恢复
```

Core保持单一Utility Process。网络任务异步运行，SQLite业务写入串行；只有量化性能证据达到门槛时才评审拆进程。

## 8. 核心数据关系

```text
app.sqlite
├─ app_settings
├─ recent_projects
└─ provider_configs

project.sqlite
├─ Project / Volume / Chapter / ProjectBrief / PlotNode / SceneBeat
├─ Draft / DraftBlock / Candidate / Version / ApplyRecord
├─ Entity / CanonFact / EntityState / StateProposal
├─ Timeline / Knowledge / Foreshadowing / CharacterArc / ArcMilestone
├─ EndingSnapshot / ValidationIssue / StoryTodo / Comment
├─ GenerationRun / ConstraintPackage / ModelSupportProfile
├─ GenreRhythmProfile / WritingSession / ProjectDictionary / FTS索引队列
├─ CommandReceipt / SemanticRevision
└─ BackupRecord / TrashEntry / ProjectSetting / MigrationJournal
```

## 9. 数据和事务规则

- `app.sqlite`只保存应用设置、最近作品、Provider元数据和UI偏好。
- `project.sqlite`保存项目权威数据。
- 所有业务写入通过Core单写队列。
- 正文补丁、建议稿采用、历史版本创建、设定更新建议、结构操作、导入和Migration必须单事务。
- GenerationRun成功与建议稿或设定更新建议结果引用必须原子收口。
- 需要跨Core重启重放的高副作用命令必须在同一业务事务写入领域持久日志或CommandReceipt；普通requestId缓存不得被描述为durable replay。
- 权威语义表变化由Schema Trigger推进SemanticRevision，Validation以该修订号判断语义新鲜度。
- 高风险操作调用统一恢复点。
- 全文索引、统计、摘要和缓存属于可重建派生数据。

## 10. 安全与隐私

- Renderer无Node、文件、数据库、环境变量和凭据能力。
- Preload只暴露具名白名单方法，输入输出使用strict Schema。
- Core验证项目ID、实体归属、建议稿类型、定稿历史版本、真实路径和符号链接边界。
- DOCX在隔离临时目录解析并限制资源。
- 凭据由安全后端加密；不安全后端直接阻断。
- 普通日志不记录正文、完整Prompt、约束全文、原始模型响应和凭据。
- 外部Provider由用户主动配置，界面明确本机、局域网和外部端点边界。

## 11. 性能基线

| 指标                 | V1目标 |
| -------------------- | -----: |
| 2K键入P95            |  ≤50ms |
| 自动保存事务P95      | ≤150ms |
| 编辑IPC P95          | ≤200ms |
| AI取消反馈           | ≤500ms |
| 5000字差异首屏       | ≤500ms |
| 5000字完整差异       |  ≤1.2s |
| 正文滚动             | ≥50fps |
| Core单次事件循环阻塞 | <100ms |

## 12. 验收与发布

P0验收项以`../testing/P0_ACCEPTANCE_MATRIX.md`中的P0-001—P0-075为唯一编号体系。

发布必须满足：

1. P0功能真实接通，不能以Mock、TODO、空实现或固定成功代替。
2. 数据安全、恢复、建议稿隔离、情节骨架类型守卫、未完成限制、锁定、保存序号和项目边界全部通过。
3. GenerationRun、建议稿、设定更新建议、Prompt和约束包引用完整。
4. AI直接写权威状态的成功次数为0。
5. 单元、集成、Migration、安全、桌面E2E、性能和AI Eval证据完整。
6. Windows、macOS和Linux有真实自用便携构建验证。
7. Provider资源超限安全失败，搜索工具交叉操作不产生永久等待。
8. stable Release具有Windows Authenticode签名，以及macOS Developer ID签名、公证、stapling与原生验证证据。

## 13. 任务路线与当前维护状态

历史V1交付由M0—M8完成；后续M9负责架构拆分，M10负责稳定性、边界与治理续作。当前独立执行体系为M0—M3、M4-01—M4-04、M8、M9及M10-01—M10-22，共67张独立任务卡。

任务卡中的静态`Implemented`不能替代有效`Verified`。当前任务、来源PR、受检Head、`main-verification`和`task-verification/<TASK-ID>`必须按`PROJECT_EXECUTION_ENTRY.md`动态解析。本文件只保存产品与技术权威，不再固化“最终任务”或瞬时Head。

M10-19已收口Generation生命周期、Active Structure、Arc依赖、FK删除、Import durable replay与SemanticRevision；M10-20完成全量审计整改和发布链路收口；M10-21同步当前权威文档与测试架构；M10-22统一Core/Renderer异步所有权、Recovery一致性、Provider严格契约和Release唯一权威。历史任务卡、Migration与Evidence继续冻结。

## 14. 开发入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime
→ 当前任务卡
→ 受影响专项真源
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

任何新功能、公开分发能力或后续缺陷修复必须重新立项。
