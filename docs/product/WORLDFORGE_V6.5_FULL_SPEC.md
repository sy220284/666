# WorldForge V6.5 完整设计规格

> 状态：Frozen  
> 基线：WorldForge V6.5  
> 日期：2026-07-13  
> 目的：将完整方案转成可开发、可测试、可追踪的统一设计规格，作为`WORLDFORGE_V6.5_EXECUTABLE_SPEC.md`的背景说明。权威顺序见`docs/INDEX.md`§1，本文件不作为工程执行的直接依据。

---

## 1. 项目概述

### 1.1 定位

WorldForge是面向单作者长篇网文创作的本地优先AI写作工作站。

核心价值：
- 本地安全：所有数据仅保存在用户本机
- 作者控制：AI始终作为可拒绝、可撤销、可追溯的候选
- 长文支持：维护超长篇连续性、一致性和伏笔回收

### 1.2 目标用户

起点名作堂级别的资深网文作者（十年写作经验）。

### 1.3 V1.0范围

| 包含 | 不包含 |
|---|---|
| 单机单用户核心写作闭环 | 云同步、多人协作、插件市场 |
| 本地AI服务接入 | 模型下载、运行时管理、向量平台 |
| 项目管理、编辑器、版本控制 | 自动发布、读者分析、CRDT |
| 规划系统、连续性维护 | 外部请求代理、账户后端 |

### 1.4 五项不可变原则

| 编号 | 原则 | 说明 |
|---|---|---|
| INV-001 | 本地数据边界 | 项目文本、设置、索引、日志、提示、评估和备份只存用户本机 |
| INV-002 | Candidate隔离 | AI输出先形成Candidate，作者采用后才进入Draft |
| INV-003 | SQLite唯一真源 | `project.sqlite`是唯一权威数据源 |
| INV-004 | 代码硬约束 | 锁定块、版本、项目边界必须代码强制执行 |
| INV-005 | 作者裁决 | AI不得直接修改权威状态 |

---

## 2. 架构设计

### 2.1 运行时结构

```text
┌──────────────────────────────────────────┐
│ Electron Main                            │
│ 窗口 / 生命周期 / OS集成 / Core监管       │
└────────────────┬─────────────────────────┘
                 │ 受控IPC
┌────────────────▼─────────────────────────┐
│ Preload                                  │
│ 具名白名单 / Schema校验 / MessagePort桥接 │
└────────────────┬─────────────────────────┘
                 │ window.worldforge
┌────────────────▼─────────────────────────┐
│ Renderer                                 │
│ React / Tiptap / Zustand / UI临时状态     │
└────────────────┬─────────────────────────┘
                 │ Command/Event Contract
┌────────────────▼─────────────────────────┐
│ Core Service Utility Process             │
│ Use Case / SQLite / 文件 / FTS5 / AI / 备份│
└──────────────────────────────────────────┘
```

### 2.2 各层职责

| 层级 | 负责 | 禁止 |
|---|---|---|
| **Electron Main** | 窗口、生命周期、OS集成、Core监管、凭据代理 | 业务SQL、保存正文、直接调用Provider、暴露Node能力 |
| **Preload** | 暴露具名API、Zod校验、转发命令、MessagePort桥接 | 暴露原始ipcRenderer、读取项目文件/数据库/凭据、保存业务状态 |
| **Renderer** | React页面、Tiptap编辑器、Zustand状态、临时显示 | 直接访问SQLite/文件/环境/凭据、持久化正文真源、直接调用模型端点 |
| **Core Service** | 业务执行、SQLite、文件、FTS5、AI、备份 | React组件、直接操作BrowserWindow、依赖Renderer Store |

### 2.3 Monorepo结构

```text
apps/desktop/
├── main/
├── preload/
└── renderer/
packages/
├── contracts/      # Zod Schema、IPC类型、错误码
├── domain/         # 领域实体、不变量
├── core-service/   # Repository、写队列、Provider、FTS、备份
├── editor-core/    # Tiptap扩展、Block Patch、锁定、块映射
├── prompts/        # Prompt版本、约束包、结构化输出解析
└── testkit/        # 测试工具、Fixtures、Stub
migrations/
├── app/
└── project/
tests/
evals/
docs/
scripts/
```

### 2.4 依赖方向

```text
apps/desktop/main ───────┐
apps/desktop/preload ────┼──> packages/contracts
apps/desktop/renderer ───┘        ↑
        │                          │
        ├──> packages/editor-core  │
        └──> packages/domain ──────┤
                                   │
packages/core-service ─────────────┘
        ├──> packages/domain
        ├──> packages/prompts
        └──> packages/contracts
```

### 2.5 数据权威

| 数据 | 权威来源 |
|---|---|
| 应用设置与最近项目 | `app.sqlite` |
| 正文、设定、状态、候选、版本 | 项目`project.sqlite` |
| API凭据 | OS Credential Store |
| Tiptap文档 | 临时编辑视图，可由DraftBlock重建 |
| FTS、摘要、统计、缓存 | 派生数据，可重建 |
| 导出文件 | 交付副本，不反向成为项目真源 |

### 2.6 并发模型

- SQLite业务写入始终串行
- 只读查询可并行，但不得读取未提交事务中间状态
- AI网络请求异步运行，不占用写队列
- 流式delta只进入任务内存和Renderer临时视图
- Candidate在完成或保存部分结果时一次持久化

---

## 3. 核心功能

### 3.1 功能关系总图

```text
项目与工作空间
├─ 规划：任务书 → 大纲 → 章节 → 场景
├─ 设定：人物/地点/势力/道具/能力/规则
├─ 正文：Draft → 编辑事务 → Version
├─ AI：约束包 → GenerationRun → Candidate → 比较/采用
├─ 连续性：Canon + EntityState + 时间线 + 知情 + 伏笔 + 尾快照
├─ 质量：校验 + 搜索 + 词典 + 修订待办
└─ 安全交付：回收站 + 备份/恢复 + 导入/导出
```

### 3.2 应用与项目（6项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| APP-001 | 应用启动 | Main创建安全窗口并启动Core Utility Process | 启动失败可诊断，Core异常可重启 |
| APP-002 | 最近项目 | `app.sqlite`只保存项目ID、路径和最近打开时间 | 首页快速继续写作，不保存正文 |
| PRJ-001 | 新建项目 | 新手向导与专业空白入口并列 | 五分钟进入第一章 |
| PRJ-002 | 打开/关闭项目 | 每次只激活一个权威项目上下文 | 避免跨项目串写 |
| PRJ-003 | 移动项目 | 通过系统目录选择器迁移整个工作空间 | 项目换盘后仍可打开 |
| PRJ-004 | 异常只读打开 | 数据库检查失败时禁止写入 | 作者仍可查看和导出 |

### 3.3 卷、章节、场景与规划（6项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| PLN-001 | 作品任务书 | 只保留高概念、阅读承诺、主角目标、核心冲突 | 为全书提供高层边界 |
| PLN-002 | 大纲树 | PlotNode支持卷、剧情弧、章节层级 | 长篇结构可拖动调整 |
| PLN-003 | 章节管理 | 章节保存标题、状态、目标字数、活动Draft和定稿Version | 章节生命周期清晰 |
| PLN-004 | 场景节拍 | 每个SceneBeat包含目标、冲突、结果、人物、地点 | AI骨架和作者规划使用同一结构 |
| PLN-005 | 拆章/并章 | 结构操作不修改历史Version，活动Draft按块迁移 | 大纲返修安全且可撤销 |
| PLN-006 | 场景跨章移动 | 有正文关联时必须预览影响并确认 | 防止拖拽规划时正文被无意改变 |

### 3.4 人物、设定与连续性（8项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| CAN-001 | 通用实体 | 人物、地点、势力、道具、能力、规则和事件使用统一基础实体 | 便于检索和关联 |
| CAN-002 | 静态Canon | 作者确认的身份、规则和稳定事实独立保存 | AI无法把推测变成设定 |
| STA-001 | 动态状态 | 位置、伤势、持有物等保存当前值和证据 | 跨章生成知道人物当前情况 |
| TIM-001 | 时间线 | 事件记录起止、精度、人物、地点和前置事件 | 发现顺序、持续和同地冲突 |
| KNO-001 | 知情信息 | 记录人物知道、相信、怀疑或误解的内容 | 对话和悬疑不泄露未得知信息 |
| FSH-001 | 伏笔 | 埋设、强化、部分揭示、揭示和取消五阶段 | 长线承诺可追踪，超期可提醒 |
| SNP-001 | 章节尾快照 | 定稿后保存下一章需要的最小状态入口 | 下一章无需重新扫描全部历史 |
| STA-002 | 状态提案 | AI只输出旧值、新值、证据和置信等级 | 作者确认后才改变权威状态 |

### 3.5 正文编辑、版本与锁定（8项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| EDT-001 | 块级正文 | 段落、对话、标题、分隔符作为DraftBlock | 支持来源、锁定、差异和局部采用 |
| EDT-002 | 自动保存 | 800ms空闲或明确事务提交 | 输入流畅且异常退出损失最小 |
| EDT-003 | 中文输入法安全 | composition期间不发送破坏性Patch | 拼音、五笔等输入不丢字、不重复 |
| EDT-004 | 粘贴清理 | 清除网页字体、颜色、脚本和无关样式 | 复制资料不会污染正文格式 |
| EDT-005 | 锁定块 | UI和Core双层保护 | AI、替换和结构操作不能碰关键段落 |
| EDT-006 | 撤销重做 | 编辑器Undo + 持久化ApplyRecord/Checkpoint | 作者可大胆尝试且理解回退边界 |
| VER-001 | 不可变Version | 保存版本、定稿和历史恢复都创建新记录 | 历史文本永不被覆盖 |
| VER-002 | Revision冲突 | AI基于旧Revision生成时仍保存Candidate，采用时逐块检查 | 作者编辑期间AI不串稿、不静默覆盖 |

### 3.6 AI接入、约束包与生成（10项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| AI-001 | Provider配置 | 统一保存协议、地址、模型、超时和credentialRef | 同时连接外部API和用户已运行的本地服务 |
| AI-002 | 连接测试 | 只验证端点可达、认证和最小生成能力 | 配置错误可在生成前发现 |
| AI-003 | 约束包 | P0代码约束、P1章节必须项、P2设定状态、P3文风、P4背景分层 | 有限上下文优先保留真正重要的信息 |
| AI-004 | T0骨架 | 生成多个结构化场景方案，不直接写长正文 | 低成本比较剧情方向 |
| AI-005 | T1扩写 | 基于选定骨架和约束包生成完整候选 | AI不会替代当前稿 |
| AI-006 | 快速改写 | 单段内联预览，应用后可立即撤销 | 高频小改不打开完整审阅页 |
| AI-007 | 结构性改写 | 跨段、跨场景和整章进入完整候选流程 | 大改动保持可审计和可比较 |
| AI-008 | 融合 | 按节拍选择不同候选并只生成必要过渡 | 作者组合优势段落 |
| AI-009 | 运行状态 | 展示真实阶段、时长、已接收文本、取消和失败 | 长请求期间作者知道系统在做什么 |
| AI-010 | 模型支持档案 | 按Provider、模型和任务记录已验证/有限/未验证 | 不把所有模型宣称为同等可靠 |

### 3.7 Candidate审阅与采用（5项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| CND-001 | 候选列表 | 按任务类型、创建时间、状态和基础Revision展示 | 多次生成可追溯、可丢弃 |
| CND-002 | 全屏比较 | 双栏、上下、单稿、只看差异和折叠未改段 | 5000字章节仍可审阅 |
| CND-003 | 块级采用 | 每个节拍或段落可选择当前稿/候选稿 | 作者无需整章二选一 |
| CND-004 | 冲突处理 | 默认当前稿与候选两栏，高级视图显示合并结果 | 冲突来源和选择清楚 |
| CND-005 | 部分候选 | 取消或连接中断时允许保存已接收文本，但明确标记不完整 | 有价值内容不丢失且不会误当完整稿 |

### 3.8 校验、搜索与修订（7项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| VAL-001 | 确定性校验 | 检查必选节拍、锁定、引用、时间顺序和格式 | 结果可重复、可作为发布阻断 |
| VAL-002 | 统计校验 | 句长、段长、对话比例、重复符号和目标字数 | 提供可解释的写作体检 |
| VAL-003 | AI语义校验 | 检查人物行为、设定偏离、衔接和文风风险 | 只提示风险，不充当裁判 |
| SRC-001 | 当前章搜索 | 类似普通编辑器的查找替换 | 高频操作简单直接 |
| SRC-002 | 全项目搜索 | 搜索正文、设定、笔记和历史Version | 百万字项目仍能快速定位 |
| SRC-003 | 安全批量替换 | 先预览命中位置和锁定块，再提交 | 避免全书误替换 |
| REV-001 | StoryTodo/批注 | 将问题绑定章节、场景或块 | 修订任务集中可回查 |

### 3.9 导入、导出、备份与恢复（8项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| IMP-001 | TXT/Markdown导入 | 检测编码并预览分章，作者调整后再提交 | 旧稿迁移不产生半成品 |
| IMP-002 | DOCX导入 | 只提取允许的文本结构和基础格式 | 复杂文档安全降级为可编辑正文 |
| EXP-001 | 多格式导出 | 从选定Version导出TXT、Markdown或DOCX | 导出内容稳定，不受未保存UI状态影响 |
| BAK-001 | 日常滚动备份 | 空闲或关闭项目时创建已验证备份 | 常规误删和损坏可恢复 |
| BAK-002 | 重大恢复点 | 迁移、导入、批量替换、拆并章前创建 | 高风险操作可完整回退 |
| BAK-003 | 手动命名快照 | 作者主动保存阶段节点 | 重要创作阶段长期保留 |
| RCV-001 | 恢复副本 | 从备份恢复到新项目目录，不直接覆盖原项目 | 原项目即使异常仍保留 |
| TRS-001 | 回收站 | 卷、章、场景先软删除 | 误删可恢复，永久删除有明确边界 |

### 3.10 UI、交互与显示（7项）

| ID | 功能 | 设计方式 | 实现效果 |
|---|---|---|---|
| UI-001 | 新手/专业模式 | 只改变字段显隐和提示，不分裂数据 | 新手低压力，资深作者保留完整控制 |
| UI-002 | 写作工作台 | 左目录、中正文、右上下文；正文为视觉中心 | 写作、查阅和AI操作不频繁跳页 |
| UI-003 | 沉浸写作 | 隐藏非写作区域，仅保留标题、正文、保存、字数和轻量AI入口 | 长时间写作不被工具面板打扰 |
| UI-004 | 状态仲裁 | P0数据安全、P1进行中、P2待决策、P3信息分级 | 首页和状态栏不过载 |
| UI-005 | 上下文帮助 | 悬停、首次提示和页面短帮助三层 | 用户不必先读长手册 |
| UI-006 | 主题与排版 | 安静编辑部；浅色、深色、护眼、高对比；正文680/760/860px | 长时阅读舒适 |
| UI-007 | 2K与曲面屏 | 内容区限宽，侧栏靠近正文，支持居中/偏左/偏右 | 超宽屏不拉长行宽 |

---

## 4. 数据库设计

### 4.1 运行参数

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

### 4.2 app.sqlite表

| 表名 | 用途 |
|---|---|
| `app_settings` | 应用设置（key-value） |
| `recent_projects` | 最近项目列表 |
| `provider_configs` | Provider配置（不含凭据正文） |

### 4.3 project.sqlite核心表

| 表组 | 表名 | 用途 |
|---|---|---|
| **项目与层级** | `projects` | 项目元数据 |
| | `volumes` | 卷 |
| | `chapters` | 章节 |
| | `plot_nodes` | 大纲节点 |
| | `scene_beats` | 场景节拍 |
| **正文、候选与版本** | `drafts` | 活动草稿 |
| | `draft_blocks` | 草稿块（段落、对话等） |
| | `candidates` | AI候选 |
| | `candidate_blocks` | 候选块 |
| | `versions` | 不可变版本 |
| | `version_blocks` | 版本块 |
| | `draft_patch_log` | Patch日志 |
| | `candidate_apply_records` | 采用记录 |
| **设定与连续性** | `entities` | 通用实体 |
| | `canon_facts` | 静态设定 |
| | `entity_states` | 动态状态 |
| | `state_proposals` | 状态提案 |
| | `timeline_events` | 时间线事件 |
| | `knowledge_states` | 知情状态 |
| | `foreshadowings` | 伏笔 |
| | `ending_snapshots` | 章节尾快照 |
| **AI与约束** | `generation_runs` | AI生成运行记录 |
| | `constraint_packages` | 约束包 |
| | `validation_issues` | 校验问题 |
| | `style_profiles` | 文风配置 |
| **搜索、笔记与日记** | `story_todos` | 待办事项 |
| | `comments` | 批注 |
| | `research_notes` | 研究笔记 |
| | `project_diaries` | 项目日记 |
| **备份、回收站与设置** | `backup_records` | 备份记录 |
| | `trash_entries` | 回收站条目 |
| | `project_settings` | 项目设置 |
| | `project_dictionary` | 项目词典 |

### 4.4 FTS5虚表

- `fts_draft_blocks`
- `fts_version_blocks`
- `fts_entities`
- `fts_research_notes`

### 4.5 事务边界

以下操作必须单事务：

1. Draft Patch与Revision递增
2. Candidate采用与ApplyRecord
3. Version及VersionBlock创建
4. 状态提案解决、EntityState更新和尾快照生成
5. 拆章、并章和跨章移动
6. 导入提交
7. 每个Migration

---

## 5. IPC协议

### 5.1 设计原则

1. Renderer不获得原始`ipcRenderer`，只调用Preload暴露的具名白名单方法
2. 所有请求、响应和事件使用Zod Schema验证
3. 所有项目命令携带`projectId`，Core验证活动项目和路径边界
4. 命令与流式事件分离：普通请求使用IPC invoke；AI增量使用MessagePort
5. IPC错误使用稳定错误码，不向Renderer暴露堆栈和内部路径
6. 协议变更遵守独立`protocolVersion`

### 5.2 通用信封

```ts
interface CommandEnvelope<T> {
  protocolVersion: 1;
  requestId: string;
  command: string;
  projectId?: string;
  payload: T;
  sentAt: string;
}

interface CommandSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
}

interface CommandFailure {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}
```

### 5.3 Preload命名空间

```ts
window.worldforge = {
  app: {},
  project: {},
  draft: {},
  version: {},
  candidate: {},
  planning: {},
  continuity: {},
  ai: {},
  validation: {},
  search: {},
  transfer: {},
  backup: {},
  settings: {}
}
```

### 5.4 命令目录

| 命名空间 | 命令示例 |
|---|---|
| `app` | `getInfo`, `getDisplays` |
| `project` | `create`, `open`, `close`, `move`, `listRecent` |
| `draft` | `get`, `applyPatch`, `undoPersistentOperation`, `setBlockLock` |
| `version` | `create`, `list`, `restoreToDraft` |
| `candidate` | `list`, `get`, `diff`, `apply`, `discard` |
| `ai` | `testProvider`, `startGeneration`, `cancelGeneration`, `listRuns` |

---

## 6. 安全设计

### 6.1 威胁模型

| ID | 威胁 | 缓解 |
|---|---|---|
| TM-001 | Renderer获得Node或文件能力 | 关闭Node集成、启用隔离与sandbox、最小Preload |
| TM-002 | 任意IPC通道或输入未校验 | 具名白名单、Zod校验、协议版本和命令注册表 |
| TM-003 | 路径穿越或符号链接越界 | Core规范化路径、真实路径检查、允许根目录校验 |
| TM-004 | 跨项目ID混用 | activeProjectId、实体归属校验、Repository强制作用域 |
| TM-005 | AI直接覆盖Draft | Candidate隔离、明确接受、Revision/Hash/LockGuard |
| TM-006 | 旧Candidate覆盖新编辑 | baseRevision、expectedHash、冲突界面 |
| TM-007 | 锁定块被批量操作修改 | 编辑器与Core双层锁定校验 |
| TM-008 | DOCX解包异常内容 | 限制大小、数量、压缩比、路径；忽略嵌入对象 |
| TM-009 | 凭据写入配置、日志或错误 | OS凭据库、credentialRef、日志脱敏 |
| TM-010 | 外部模型端点记录内容 | 明确端点类型、用户主动配置、本机直连 |
| TM-011 | 数据库损坏或断电 | WAL、单写队列、事务、完整性检查和三轨备份 |
| TM-012 | 恢复覆盖原项目 | 默认恢复到新目录，验证后由作者决定 |
| TM-013 | 日志或诊断包包含正文 | 默认只记ID、耗时、计数和Hash；导出前列出内容 |
| TM-014 | 远程页面在应用内加载 | 禁止导航、新窗口和远程内容 |
| TM-015 | 恶意导出路径 | 系统选择器、目标确认、临时文件和原子重命名 |

### 6.2 Electron安全要求

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  preload: PRELOAD_PATH
}
```

还必须：
- 严格CSP，不允许`unsafe-eval`进入正式构建
- 拦截`will-navigate`、`setWindowOpenHandler`和下载行为
- 不加载用户提供的HTML为应用页面

### 6.3 代码硬保证

以下指标必须保持为0：
- 锁定块被修改次数
- 未确认Candidate写入Draft次数
- Revision冲突静默覆盖次数
- AI直接修改权威状态次数
- 跨项目ID成功写入次数

---

## 7. UI设计系统

### 7.1 视觉定位

安静编辑部：低干扰、清晰、稳定、具有编辑质感。

### 7.2 Design Token

```text
color.bg.canvas      color.text.primary     color.accent.primary
color.bg.paper       color.text.secondary   color.ai.source
color.bg.panel       color.text.muted       color.warning
color.bg.elevated    color.border.subtle    color.danger
color.border.strong  color.success

space.1—space.10
radius.sm/md/lg
shadow.popover/dialog
motion.fast/normal/slow
layout.sidebar.left/right
layout.content.narrow/normal/wide
```

### 7.3 颜色系统

| 主题 | 背景 | 正文 | AI来源 |
|---|---|---|---|
| 浅色 | `#F5F4F1` | `#242321` | `#6B658E` |
| 深色 | `#171716` | `#F1EEE8` | `#A7A0D0` |
| 护眼 | 低亮暖灰 | - | - |
| 高对比 | 加强边界 | 高对比度 | 多感官提示 |

### 7.4 字体与排版

| 场景 | 默认值 |
|---|---|
| 正文 | 18px |
| 正文可调范围 | 14—28px |
| 行高 | 1.75—1.9 |
| 正文宽度 | 680/760/860 CSS px |
| 最大行宽 | 860 CSS px |

### 7.5 响应式断点

| 宽度 | 布局 |
|---|---|
| ≥1100px | 三栏布局 |
| <1100px | 右栏变为抽屉 |
| <900px | 双栏都变为抽屉 |

### 7.6 支持的分辨率

- 1280×800 最小分辨率
- 2560×1440（100%/125%/150%）高分屏
- 3440×1440 / 3840×1600 超宽屏（21:9）
- 混合DPI双显示器

### 7.7 组件基线

```text
AppShell, TopBar, PrimaryNav, Sidebar, Drawer
WorkspaceHeader, StatusIndicator, TaskBar
Button, IconButton, Input/Textarea/Select/Switch/Slider
Tabs, Tooltip, Popover, Dialog, ContextMenu
Toast, Banner, EmptyState, ErrorState, Skeleton
VirtualList, TreeView, DataList
CandidateCard, ConflictRow, ValidationIssueRow, RecoveryCard
```

---

## 8. 性能预算

| 指标 | 目标 |
|---|---:|
| 2K键入P95 | ≤50ms |
| 自动保存P95 | ≤150ms |
| 编辑IPC P95 | ≤200ms |
| AI取消反馈 | ≤500ms |
| 5000字Diff首屏 | ≤500ms |
| 完整Diff | ≤1.2s |
| 正文滚动 | ≥50fps |
| 单个Core事件循环阻塞 | <100ms |

---

## 9. 验收标准（P0）

### 9.1 工程与安全底座（5项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-001 | Monorepo可构建 | `pnpm lint/typecheck/test/build`全部通过 |
| P0-002 | Renderer隔离 | 无`require/process/fs`能力；Node集成关闭 |
| P0-003 | Preload白名单 | 未注册命令无法调用；所有输入Schema校验 |
| P0-004 | CSP与导航 | 正式构建无不安全脚本；远程页面不在应用内打开 |
| P0-005 | Core监管 | Core异常退出可报告并安全重启，不丢已提交数据 |

### 9.2 SQLite与项目（7项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-006 | 数据库参数 | WAL、外键、busy_timeout和synchronous符合规格 |
| P0-007 | 单写队列 | 自动保存与AI并行100轮无丢写、无静默覆盖 |
| P0-008 | 项目边界 | 跨项目ID、路径越界和符号链接逃逸均被拒绝 |
| P0-009 | 项目创建 | 新建后工作空间、manifest和项目库完整 |
| P0-010 | 项目移动 | 新目录校验通过后更新路径；失败时原项目保持可用 |
| P0-011 | 异常只读 | 完整性检查失败时停止写入，仍可浏览和导出 |
| P0-012 | Migration | 空库、旧库、升级中断和高版本只读场景通过 |

### 9.3 编辑器与正文模型（8项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-013 | 中文输入 | 拼音/五笔composition不丢字、不重复 |
| P0-014 | 自动保存 | 空闲保存P95≤150ms；关闭重开正文一致 |
| P0-015 | 粘贴清理 | 网页样式、脚本和无关格式被移除 |
| P0-017 | 锁定块 | AI、替换、拆并章和Patch均不能修改锁定块 |
| P0-018 | Revision | 旧Revision写入被拒绝或进入冲突 |
| P0-019 | Draft Patch | 插入、更新、删除、移动可事务提交和撤销 |
| P0-020 | 不可变Version | 创建后无业务修改路径；恢复生成新Draft |

### 9.4 Candidate与AI（12项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-021 | Candidate隔离 | 未确认Candidate写入Draft次数为0 |
| P0-022 | Provider连接 | 本地Stub和至少一个受支持协议完成连接、流式、取消 |
| P0-023 | 流式协议 | delta有序、批量、可恢复；切章不串稿 |
| P0-024 | 取消 | 命令反馈≤500ms |
| P0-025 | T0 | 输出通过Schema；多方案存在有效差异 |
| P0-026 | T1 | 基于选定骨架生成Candidate；不直接修改Draft |
| P0-027 | 快速改写 | 单段从发起到应用不超过2次主要点击；可立即撤销 |
| P0-029 | 候选Diff | 5000字首屏≤500ms，完整≤1.2s |
| P0-030 | 候选采用 | 锁定、Revision、Hash和项目范围全部校验；一次事务提交 |
| P0-031 | 采用撤销 | Ctrl/Cmd+Z可整体撤销；重启后可恢复 |
| P0-032 | 冲突处理 | 当前稿、候选和冲突来源清楚；作者选择后才提交 |

### 9.5 规划与连续性（10项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-033 | 任务书与大纲 | 可跳过非必要字段；大纲拖动不自动改正文 |
| P0-034 | 章节场景 | 卷、章、SceneBeat可创建、排序、移动和软删除 |
| P0-035 | 拆章并章 | 高风险操作前创建恢复点，历史Version不变 |
| P0-036 | 实体与Canon | 人物等实体可关联；AI无直接写Canon接口 |
| P0-037 | 动态状态 | 当前值、历史值、生效章节和证据可查询 |
| P0-038 | 时间线 | 顺序、同地和依赖冲突可检测 |
| P0-039 | 知情信息 | 约束包能区分知道、怀疑、误解和未知 |
| P0-040 | 伏笔 | 生命周期、回收窗口和章节关联可维护 |
| P0-041 | 状态提案 | pending不改变状态；接受后更新状态并生成尾快照 |
| P0-042 | 旧章返修 | 相关后续派生数据标记stale |

### 9.6 校验、搜索和交付（8项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-043 | 确定性校验 | 相同输入结果一致，问题包含锚点和依据 |
| P0-044 | AI语义校验 | 仅生成风险提示；可忽略、静音、降级和标误报 |
| P0-046 | 全项目FTS | 中型Fixture内查询达到预算；索引可重建 |
| P0-047 | 批量替换 | 先预览；锁定块默认跳过；提交前恢复点 |
| P0-048 | TXT导入 | UTF-8/UTF-16/GB18030识别或人工选择 |
| P0-049 | DOCX导入 | 只提取允许内容；异常文档不写项目 |
| P0-050 | 导出 | 从选定Version原子导出TXT、Markdown和DOCX |

### 9.7 备份、恢复和回收站（6项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-051 | 日常备份 | 在线备份、完整性检查和Hash通过 |
| P0-052 | 重大恢复点 | 迁移、导入、批量替换和结构操作前创建并永久保留 |
| P0-054 | 最后备份保护 | 最后一份已验证备份不能自动删除 |
| P0-055 | 恢复副本 | 恢复到新目录，原项目不被覆盖 |
| P0-056 | 回收站 | 卷、章、场景可恢复；永久删除展示影响并二次确认 |

### 9.8 UI与显示（11项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-057 | 新手模式 | 五分钟建立最小项目并进入第一章 |
| P0-058 | 专业模式 | 可跳过向导、任务书和AI，直接自由写作 |
| P0-060 | 沉浸写作 | 正文、保存、字数和轻量AI入口保留 |
| P0-061 | AI真实进度 | 阶段对应真实程序状态，不显示伪造倒计时 |
| P0-063 | 1280×800 | 可完成写作、AI、候选和导出，无整页横向滚动 |
| P0-064 | 2K高DPI | 100/125/150%下文字与图标清晰 |
| P0-065 | 21:9曲面/超宽 | 正文限宽，操作靠近工作区 |
| P0-066 | 混合DPI | 窗口跨显示器后尺寸、缩放和位置合理恢复 |

### 9.9 隐私与日志（4项）

| ID | 验收项 | 通过标准 |
|---|---|---|
| P0-067 | 凭据 | 实际值只在系统凭据库和请求内存中出现 |
| P0-068 | 普通日志 | 自动扫描不含正文、完整Prompt和凭据 |
| P0-069 | 诊断包 | 生成前显示清单；默认不含项目数据库和创作内容 |
| P0-070 | 网络边界 | 除用户主动Provider请求和系统外链外，无项目数据外发 |

---

## 10. 任务路线图

### 10.1 阶段划分

| 阶段 | 内容 | 任务数 |
|---|---|:---:|
| **M0** | 工程与安全底座 | 6 |
| **M0.5** | AI质量验证 | 1 |
| **M1** | 编辑与版本核心 | 5 |
| **M2** | 规划与连续性 | 4 |
| **M3** | AI生成闭环 | 4 |
| **M4** | 完整交付 | 5 |
| **M5** | 发布硬化 | 3 |

### 10.2 M0任务

| 任务 | 内容 |
|---|---|
| M0-01 | Monorepo与质量工具 |
| M0-02 | Electron安全配置 |
| M0-03 | SQLite写队列 |
| M0-04 | IPC协议与Preload |
| M0-05 | 高分屏与响应式框架 |
| M0-06 | AI质量验证框架 |

---

## 11. 定义完成

任务完成标准：
1. 行为和非目标匹配任务描述
2. 测试证明成功和失败路径
3. 迁移和契约同步
4. 取消和冲突路径处理
5. 安全/隐私规则保留
6. 必需命令通过
7. 证据记录在`docs/test-evidence/<TASK-ID>/`
8. 剩余限制和风险说明
9. 无无关重构、TODO、假数据或空实现

---

**附录**：本文件整合自以下文档，作为背景参考（权威顺序见`docs/INDEX.md`§1）：
- ARCHITECTURE.md
- MODULE_BOUNDARIES.md
- DATA_FLOW.md
- DATABASE_SCHEMA.md
- FUNCTION_CATALOG.md
- IPC_CONTRACTS.md
- ERROR_CODES.md
- EVENT_PROTOCOL.md
- THREAT_MODEL.md
- PRIVACY_AND_LOGGING.md
- UI_SYSTEM.md
- SCREEN_SPECIFICATIONS.md
- EDITOR_INTERACTION_SPEC.md
- CANDIDATE_REVIEW_SPEC.md
- RESPONSIVE_AND_DPI.md
- P0_ACCEPTANCE_MATRIX.md
- PERFORMANCE_BUDGETS.md
- M0_TASKS.md - M5_TASKS.md