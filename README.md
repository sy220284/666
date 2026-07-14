# WorldForge（创世工坊）

WorldForge 是一款面向单作者长篇网文创作的本地优先 AI 写作工作站。

核心原则：

- 所有作品、数据库、索引、日志、备份和配置仅保存在用户本地。
- AI 仅通过用户自行配置的模型 API 或已在本地运行的兼容服务接入。
- AI 输出先进入候选稿，未经作者确认不得覆盖当前正文。
- SQLite 是项目唯一数据真源。
- Draft、Candidate、Version 三层分离，支持锁定、撤销、回滚和审计。

## 当前状态

仓库已完成 **V6.5方案、P0工程文档与UI实施规格初始化**，尚未开始可运行代码工程初始化。当前基线为 **WorldForge V6.5**。

## 权威文档

- [`docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`](./docs/product/WORLDFORGE_V6.5_FULL_SPEC.md)：V6.5最高权威完整设计规格（Codex可检索Markdown真源）。
- [`WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx`](./WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx)：阅读与归档版完整设计方案。
- [`AGENTS.md`](./AGENTS.md)：仓库级强制执行规则。
- [`docs/PROJECT_EXECUTION_ENTRY.md`](./docs/PROJECT_EXECUTION_ENTRY.md)：项目执行统一入口（按任务类型查文档路由）。
- [`docs/tasks/ACTIVE_TASK.md`](./docs/tasks/ACTIVE_TASK.md)：当前唯一允许执行的开发任务控制文件。
- [`docs/process/CODEX_EXECUTION_PLAYBOOK.md`](./docs/process/CODEX_EXECUTION_PLAYBOOK.md)：从启动到关闭任务的完整闭环操作手册。
- [`docs/decisions/IMPLEMENTATION_DECISIONS.md`](./docs/decisions/IMPLEMENTATION_DECISIONS.md)：15项实现级冻结技术决策。
- [`docs/INDEX.md`](./docs/INDEX.md)：全部工程文档总索引与维护规则。

## 项目整体架构

```text
WorldForge 创世工坊
│
├─ 1. 桌面应用层
│  ├─ Electron Main
│  │  ├─ 应用生命周期
│  │  ├─ 窗口管理
│  │  ├─ 显示器与DPI管理
│  │  ├─ 系统菜单与文件选择器
│  │  ├─ 外链调用
│  │  ├─ OS凭据代理
│  │  └─ Core进程监管
│  │
│  ├─ Preload安全桥
│  │  ├─ window.worldforge具名API
│  │  ├─ IPC请求Schema校验
│  │  ├─ 响应与错误归一化
│  │  └─ MessagePort流式事件桥接
│  │
│  └─ Renderer界面层
│     ├─ React页面
│     ├─ Tiptap正文编辑器
│     ├─ Zustand界面状态
│     ├─ 候选审阅界面
│     ├─ 规划与设定工作台
│     ├─ 检查与导出工作台
│     └─ 高分屏与主题系统
│
├─ 2. Core Service核心业务层
│  ├─ Command Router命令路由
│  ├─ Project项目用例
│  ├─ Draft正文用例
│  ├─ Candidate候选用例
│  ├─ Version版本用例
│  ├─ Planning规划用例
│  ├─ Continuity连续性用例
│  ├─ AI生成管线
│  ├─ Validation校验管线
│  ├─ Search全文检索
│  ├─ Import / Export
│  ├─ Backup / Recovery
│  ├─ Repository持久化层
│  ├─ SQLite串行写队列
│  └─ Task / Event任务事件中心
│
├─ 3. 领域与公共包
│  ├─ packages/contracts
│  │  ├─ Zod Schema
│  │  ├─ IPC命令
│  │  ├─ 流式事件
│  │  ├─ 错误码
│  │  └─ AI结构化输出协议
│  │
│  ├─ packages/domain
│  │  ├─ 项目领域模型
│  │  ├─ Draft / Candidate / Version
│  │  ├─ 人物与设定
│  │  ├─ 状态、时间线、知情、伏笔
│  │  └─ 纯业务不变量
│  │
│  ├─ packages/core-service
│  │  ├─ SQLite
│  │  ├─ Repository
│  │  ├─ Migration
│  │  ├─ AI Provider
│  │  ├─ 文件与备份
│  │  └─ 业务Use Case
│  │
│  ├─ packages/editor-core
│  │  ├─ Tiptap扩展
│  │  ├─ Block Patch
│  │  ├─ 中文输入法处理
│  │  ├─ 锁定保护
│  │  └─ 中文Diff
│  │
│  ├─ packages/prompts
│  │  ├─ Prompt版本
│  │  ├─ 约束包序列化
│  │  ├─ 文风转译
│  │  └─ 输出解析与清洗
│  │
│  └─ packages/testkit
│     ├─ 临时项目
│     ├─ 测试数据库
│     ├─ Provider Stub
│     ├─ 故障注入
│     └─ 大型中文测试数据
│
├─ 4. 数据层
│  ├─ app.sqlite
│  │  ├─ 应用设置
│  │  ├─ 最近项目
│  │  └─ Provider元数据
│  │
│  ├─ project.sqlite
│  │  ├─ 卷章场景
│  │  ├─ Draft正文
│  │  ├─ Candidate候选
│  │  ├─ Version历史版本
│  │  ├─ 人物与设定
│  │  ├─ 动态状态
│  │  ├─ 时间线
│  │  ├─ 知情信息
│  │  ├─ 伏笔
│  │  ├─ AI任务
│  │  ├─ 校验问题
│  │  └─ 备份记录
│  │
│  ├─ FTS5全文索引
│  ├─ 本地项目文件
│  ├─ 本地附件
│  └─ OS Credential Store
│
├─ 5. AI接入层
│  ├─ OpenAI兼容协议
│  ├─ Anthropic协议
│  ├─ 明确实现的自定义协议
│  ├─ 用户外部API
│  └─ 用户已运行的本地模型服务
│
├─ 6. 测试体系
│  ├─ 单元测试
│  ├─ Repository测试
│  ├─ IPC集成测试
│  ├─ Migration测试
│  ├─ Electron安全测试
│  ├─ Playwright E2E
│  ├─ 性能测试
│  ├─ AI Eval
│  └─ 2K / 21:9 / 混合DPI验收
│
└─ 7. V1.5增强
   ├─ L0—L5分层记忆
   ├─ 卷级连续性检查点
   ├─ 超长篇性能适配
   ├─ AI项目日记
   └─ 经评测后决定是否引入语义检索
```

## 运行时数据流

### 正文编辑

```text
作者输入
→ Tiptap编辑事务
→ editor-core生成Block Patch
→ Renderer批量提交
→ Preload校验
→ Core校验项目、Revision、Hash和锁定
→ SQLite串行写队列
→ 单事务写入Draft
→ Revision递增
→ 返回保存状态
```

### AI生成

```text
作者发起T0 / T1 / 改写
→ 创建GenerationRun
→ 读取章节、场景、尾快照、状态、伏笔和规则
→ 组装ConstraintPackage
→ Core直连模型端点
→ MessagePort流式返回
→ Renderer临时展示
→ 完成后保存Candidate
→ 作者审阅
→ 作者选择采用
→ Block Patch事务写入Draft
```

### 定稿与状态更新

```text
作者定稿
→ 创建不可变Version
→ 生成StateProposal
→ 作者逐条确认
→ 更新EntityState
→ 创建EndingSnapshot
→ 下一章约束包读取
```

## 功能关系总图

```text
项目工作空间
│
├─ 规划系统
│  ├─ 作品任务书
│  ├─ 大纲树
│  ├─ 卷章结构
│  └─ SceneBeat
│
├─ 设定与连续性
│  ├─ 人物与实体
│  ├─ Canon
│  ├─ 动态状态
│  ├─ 时间线
│  ├─ 知情信息
│  ├─ 伏笔
│  └─ 章节尾快照
│
├─ 正文系统
│  ├─ Draft
│  ├─ DraftBlock
│  ├─ 锁定
│  ├─ Revision
│  └─ Version
│
├─ AI系统
│  ├─ Provider
│  ├─ 约束包
│  ├─ T0骨架
│  ├─ T1扩写
│  ├─ 快速改写
│  ├─ 结构性改写
│  └─ 融合
│
├─ 候选审阅
│  ├─ Candidate
│  ├─ Diff
│  ├─ 节拍级采用
│  ├─ 冲突处理
│  └─ 应用撤销
│
├─ 质量系统
│  ├─ 确定性校验
│  ├─ 统计校验
│  ├─ AI语义校验
│  ├─ 搜索
│  ├─ 替换
│  └─ StoryTodo
│
└─ 数据安全与交付
   ├─ 导入
   ├─ 导出
   ├─ 回收站
   ├─ 三轨备份
   └─ 恢复副本
```

## 功能清单明细

### 应用与项目

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| APP-001 | 应用启动 | 安全启动桌面端和Core服务 | Electron Main、Core健康握手 | 所有功能基础 |
| PRJ-001 | 新建项目 | 快速建立本地作品工程 | 创建目录、Manifest、数据库和第一章 | 新手向导、空白项目 |
| PRJ-002 | 打开/关闭项目 | 防止项目串写，确保保存完成 | activeProjectId、数据库连接绑定 | 所有IPC携带projectId |
| PRJ-003 | 移动项目 | 项目可安全迁移到其他磁盘 | 关闭、复制、Hash与完整性验证 | 最近项目、备份、路径边界 |
| PRJ-004 | 异常只读打开 | 数据异常时仍能查看与导出 | 只读数据库连接 | 恢复、导出、诊断 |

### 规划与结构

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| PLN-001 | 作品任务书 | 保存全书核心方向和边界 | ProjectBrief | 进入AI约束包 |
| PLN-002 | 大纲树 | 管理卷、剧情弧、章节层级 | PlotNode树结构 | 章节与SceneBeat依赖 |
| PLN-003 | 章节管理 | 管理章节状态、顺序和定稿 | Chapter实体 | Draft、Version、导出 |
| PLN-004 | 场景节拍 | 规划章节目标、冲突和结果 | SceneBeat | T0、T1、校验、导航 |
| PLN-005 | 拆章/并章 | 安全调整章节结构 | 事务移动Block和关联 | 恢复点、锁定、版本 |
| PLN-006 | 场景跨章移动 | 安全移动场景及关联内容 | SceneBeat与正文分离处理 | 影响预览、连续性失效 |

### 人物、设定与连续性

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| CAN-001 | 通用实体 | 统一管理人物、地点、势力、道具、能力和规则 | Entity基表 | 被场景、状态和伏笔引用 |
| CAN-002 | 静态Canon | 保存作者确认的稳定事实 | CanonFact | AI只能读取和提议 |
| STA-001 | 动态状态 | 管理位置、伤势、关系和持有物变化 | EntityState时序记录 | 尾快照、约束包 |
| TIM-001 | 时间线 | 管理事件顺序、持续和因果 | TimelineEvent | 连续性校验 |
| KNO-001 | 知情信息 | 管理人物知道、怀疑和误解的内容 | KnowledgeState | 防止角色提前知情 |
| FSH-001 | 伏笔系统 | 管理埋设、强化、揭示和超期 | Foreshadowing关系表 | SceneBeat、约束包、校验 |
| SNP-001 | 章节尾快照 | 保存下一章需要的最小连续性入口 | EndingSnapshot | 下一章生成优先读取 |
| STA-002 | 状态提案 | AI提出变化，作者确认后写入 | StateProposal状态机 | 定稿、日记、尾快照 |
| ARC-001 | 人物弧光定义 | 为人物创建成长/黑化/觉醒等类型弧光 | CharacterArc表 | 与EntityState、时间线同层 |
| ARC-002 | 弧光节点与状态机 | 里程碑节点planned/hit/skipped | ArcMilestone表 | 命中经StateProposal确认（ADR-006） |
| ARC-003 | 弧光一致性校验 | 检测性格标签与弧光阶段是否矛盾 | 并入VAL-003 | 避免人物无预警反差 |
| ARC-004 | 弧光时间线关联 | 弧光节点可依赖TimelineEvent | ArcMilestone.depends_on | 时间线校验联动 |

### 正文编辑与版本

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| EDT-001 | 块级正文 | 支持段落级编辑、锁定、来源和Diff | Tiptap节点映射DraftBlock | Candidate与Version共用 |
| EDT-002 | 自动保存 | 输入后自动安全保存 | 800ms空闲、Patch事务 | Revision递增 |
| EDT-003 | 中文输入法 | 拼音、五笔输入不丢字 | composition事务合并 | 自动保存和撤销 |
| EDT-004 | 粘贴清理 | 去除网页污染格式 | Tiptap Paste Rule | 大文本可转导入 |
| EDT-005 | 锁定块 | 保护关键段落不被AI和批量操作修改 | Editor插件 + Core LockGuard | 所有Patch必须校验 |
| EDT-006 | 撤销重做 | 普通编辑和AI采用均可回退 | ProseMirror History + ApplyRecord | Version与恢复点 |
| VER-001 | 不可变Version | 历史定稿永不被覆盖 | Version/VersionBlock只新增 | 导出、恢复、比较 |
| VER-002 | Revision冲突 | 防止旧AI结果覆盖新修改 | baseRevision + expectedHash | 候选冲突界面 |

### AI接入与生成

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| AI-001 | Provider配置 | 接入外部API或本地模型服务 | ProviderConfig + credentialRef | 设置中心 |
| AI-002 | 连接测试 | 检查认证、流式和结构化输出 | Core最小请求 | AI配置反馈 |
| AI-003 | 约束包 | 给模型提供当前章最相关信息 | P0—P4分层、FTS5、Token裁剪 | 所有AI任务共用 |
| AI-004 | T0骨架 | 低成本生成多个章节结构方案 | JSON Schema骨架Candidate | 选定后进入T1 |
| AI-005 | T1扩写 | 将骨架扩写成完整章节候选 | 流式GenerationRun | Candidate审阅 |
| AI-006 | 快速改写 | 单段原地预览和一键应用 | 选区、邻段和最小约束 | 可立即撤销 |
| AI-007 | 结构性改写 | 跨段和整章进入完整审阅流程 | 完整Candidate | Diff、冲突、采用 |
| AI-008 | 候选融合 | 按节拍组合不同候选 | BeatSourceMapping | 生成merge Candidate |
| AI-009 | AI运行状态 | 展示真实阶段、时长和取消 | MessagePort事件 | 全局任务条 |
| AI-010 | 模型支持档案 | 标识模型对各任务的可靠程度 | ModelSupportProfile | 已验证、有限、未验证 |

### 候选审阅

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| CND-001 | 候选列表 | 查看每次AI生成记录 | Candidate元数据 | GenerationRun关联 |
| CND-002 | 候选比较 | 双栏、上下、单稿和差异视图 | 结构Diff + 中文字符Diff | 2K和窄屏自适应 |
| CND-003 | 块级采用 | 按段落或节拍采用候选 | Block Patch集合 | 锁定与Revision校验 |
| CND-004 | 冲突处理 | 解决当前稿与候选不一致 | ConflictSet | 当前、候选、手动合并 |
| CND-005 | 部分候选 | 保存取消或断流时的可用部分 | completeness=partial | 不可直接定稿 |

### 校验、搜索与修订

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| VAL-001 | 确定性校验 | 检查节拍、引用、时间顺序和锁定 | 纯规则引擎 | 可作为硬校验 |
| VAL-002 | 统计校验 | 检查句长、段长、比例和重复 | 本地文本统计 | 文风和发布检查 |
| VAL-003 | AI语义校验 | 提示人物、设定、衔接和文风风险 | ValidationIssue | 可忽略、降级、标误报 |
| SRC-001 | 当前章搜索 | 普通编辑器式查找替换 | Tiptap搜索插件 | 写作工作台 |
| SRC-002 | 全项目搜索 | 检索正文、设定、版本和笔记 | SQLite FTS5 | 约束包也使用 |
| SRC-003 | 安全批量替换 | 预览后批量修改 | ReplacePlan + 恢复点 | 锁定块默认跳过 |
| REV-001 | StoryTodo/批注 | 管理轻量修订问题，完成后自动重新触发来源校验 | Todo、Comment | 校验结果可转待办 |
| RHY-001 | 爽点密度分析 | 按品类参考区间提示节奏密度，建议级 | GenreRhythmProfile | 与VAL-002同管线 |
| RHY-002 | 章末钩子检测 | 提示结尾悬念/信息释放是否偏弱 | 规则+语义联合检测 | 挂载VAL-003 |
| RHY-003 | 更新节奏跟踪 | 日更字数目标与实际速度对比 | Draft历史统计 | 独立展示 |
| RHY-004 | 黄金三章检测 | 仅前3章生效的开篇质量检查点 | 复用RHY-001口径 | 建议级，可关闭 |

### 导入、导出、备份与恢复

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| IMP-001 | TXT/Markdown导入 | 导入旧稿并预览分章 | 编码识别 + ImportPlan | 提交前不改数据库 |
| IMP-002 | DOCX导入 | 安全提取正文和基础格式 | 隔离解析、ZIP限制 | 忽略宏、OLE和外链 |
| EXP-001 | 多格式导出 | 从指定Version导出作品 | TXT/Markdown/DOCX渲染 | 不读取未确认临时状态 |
| BAK-001 | 日常备份 | 常规滚动保护项目 | SQLite Online Backup | 默认保留14份 |
| BAK-002 | 重大恢复点 | 高风险操作前永久保护 | operation checkpoint | 迁移、导入、替换、拆并章 |
| BAK-003 | 手动快照 | 作者保存重要阶段 | 命名、备注、验证 | 长期保留 |
| RCV-001 | 恢复副本 | 从备份恢复且不覆盖原项目 | 新目录恢复与校验 | 注册为新项目 |
| TRS-001 | 回收站 | 卷章场景软删除和恢复 | deletedAt + TrashEntry | 永久删除需影响检查 |

### UI与交互

| ID | 功能 | 实现效果 | 核心实现 | 交互关系 |
|---|---|---|---|---|
| UI-001 | 新手/专业模式 | 控制信息密度，不分裂数据 | ViewPreference | 可随时切换 |
| UI-002 | 写作工作台 | 左目录、中正文、右上下文 | CSS Grid | 本章、AI、人物、设定、检查 |
| UI-003 | 沉浸写作 | 隐藏非写作区域 | 视图状态 | 任意模式可进入 |
| UI-004 | 状态仲裁 | 控制通知优先级和数量 | StatusArbiter | 首页最多2条主动提示 |
| UI-005 | 上下文帮助 | 降低新手学习成本 | HelpRegistry | 悬停、首次提示、页面帮助 |
| UI-006 | 主题与排版 | 支持浅色、深色、护眼、高对比 | Design Token | 字体、字号、版心独立设置 |
| UI-007 | 2K与曲面屏 | 高分屏、超宽屏下保持舒适布局 | CSS视口断点、DIP窗口恢复 | 居中、偏左、偏右工作区 |

### V1.5超长篇增强

| ID | 功能 | 实现效果 | 核心实现 | 关系 |
|---|---|---|---|---|
| MEM-001 | L0—L5记忆 | 几百万字项目分层召回 | 操作、章节、卷、状态、历史和冷正文分层 | 约束包 |
| MEM-002 | 时序状态 | 区分当前状态和历史状态 | validFrom / validUntil | EntityState |
| MEM-003 | 卷级检查点 | 控制旧章返修的失效传播范围 | 状态Hash检查点 | 连续性重算 |
| DIA-001 | AI项目日记 | 汇总剧情、设定、伏笔和风险 | DiaryCandidate | 不直接修改Canon |
| DIA-002 | 定时日记 | 每N章、每日、每周或卷末整理 | 本地计划与补执行 | 默认外部API自动调用关闭 |

## 核心功能依赖链

```text
项目工作空间
→ 卷章场景
→ Draft块级编辑
→ Revision与锁定
→ Candidate与Version
→ 人物设定与连续性
→ 约束包
→ T0/T1生成
→ 候选比较与采用
→ 定稿
→ 状态提案
→ 尾快照
→ 下一章生成
```

搜索、校验、导入导出和备份贯穿整个链路。

## UI实施规格

- [`docs/ui/README.md`](./docs/ui/README.md)：UI文档索引。
- [`UI_SYSTEM.md`](./docs/ui/UI_SYSTEM.md)：安静编辑部视觉系统与Design Token。
- [`INFORMATION_ARCHITECTURE.md`](./docs/ui/INFORMATION_ARCHITECTURE.md)：六个一级入口和三个核心工作台。
- [`SCREEN_SPECIFICATIONS.md`](./docs/ui/SCREEN_SPECIFICATIONS.md)：全部核心页面规格。
- [`EDITOR_INTERACTION_SPEC.md`](./docs/ui/EDITOR_INTERACTION_SPEC.md)：中文编辑、锁定、保存、撤销和快速改写。
- [`CANDIDATE_REVIEW_SPEC.md`](./docs/ui/CANDIDATE_REVIEW_SPEC.md)：候选比较、融合、采用、冲突和回退。
- [`RESPONSIVE_AND_DPI.md`](./docs/ui/RESPONSIVE_AND_DPI.md)：1280×800、2K、21:9曲面屏和混合DPI。
- [`UI_ACCEPTANCE_CHECKLIST.md`](./docs/ui/UI_ACCEPTANCE_CHECKLIST.md)：UI专项验收与发布阻断项。

## P0工程文档

- [`docs/product/V1_SCOPE_AND_ACCEPTANCE.md`](./docs/product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0范围和关闭条件。
- [`docs/product/FUNCTION_CATALOG.md`](./docs/product/FUNCTION_CATALOG.md)：功能设计、效果、实现方式、关系与交互明细。
- [`docs/product/V1.0_TRACEABILITY_MATRIX.md`](./docs/product/V1.0_TRACEABILITY_MATRIX.md)：需求、任务和验收追踪。
- [`docs/roadmap/V1.0_ROADMAP.md`](./docs/roadmap/V1.0_ROADMAP.md)：M0—M5路线图。
- [`docs/decisions/README.md`](./docs/decisions/README.md)：五项核心ADR。
- [`docs/database/DATABASE_SCHEMA.md`](./docs/database/DATABASE_SCHEMA.md)：数据库Schema。
- [`docs/contracts/IPC_CONTRACTS.md`](./docs/contracts/IPC_CONTRACTS.md)：IPC命令契约。
- [`docs/ai/LOCAL_AI_SERVICE_SPEC.md`](./docs/ai/LOCAL_AI_SERVICE_SPEC.md)：本地与外部AI端点接入边界。
- [`SECURITY.md`](./SECURITY.md)：安全策略。
- [`docs/testing/P0_ACCEPTANCE_MATRIX.md`](./docs/testing/P0_ACCEPTANCE_MATRIX.md)：P0验收矩阵。
- [`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)：M0—M5任务卡索引。

## 目标技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- SQLite + better-sqlite3 + FTS5
- Zustand + Zod
- Vitest + Playwright
- pnpm workspace

## 版本范围

### V1.0

完成本地项目、块级编辑、Draft/Candidate/Version、人物设定、大纲场景、AI候选、连续性、搜索校对、备份恢复和导入导出等核心写作闭环。

### V1.5

在真实长篇项目验证后，再实施完整分层记忆、卷级连续性检查点、定时 AI 项目日记、超长篇压力适配和条件性语义检索。

## 开发入口

任何开发任务按以下顺序启动：

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的一任务一文件任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration和追踪矩阵
```

当前仓库处于文档与规格完成阶段，尚未授权开始代码工程初始化。

下一候选任务：[`M0-01 Monorepo与质量工具`](./docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md)，需作者激活 [`docs/tasks/ACTIVE_TASK.md`](./docs/tasks/ACTIVE_TASK.md) 后方可开始。

任务体系采用**一任务一文件**，共24个任务分布于M0—M5六个里程碑，详见 [`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)。

## 许可证

当前方案基线采用 AGPL-3.0。正式发布前将结合第三方集成与分发策略再次完成许可证审查。
