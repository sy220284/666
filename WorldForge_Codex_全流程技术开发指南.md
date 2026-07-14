# WorldForge Codex 全流程技术开发指南

> 适用基线：WorldForge V6.5  
> 目标版本：V1.0核心写作闭环；V1.5超长篇增强  
> 用途：将冻结方案转换为可按任务卡执行、测试和验收的工程路线。

## 1. 文档定位

本指南不替代产品规格。任何开发任务按以下顺序启动：

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ 独立任务卡
→ 专项规格
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

## 2. 产品边界

V1.0解决单作者在本地完成长篇小说的完整闭环：

```text
基础项目与写作
→ 安全编辑与版本
→ 规划、设定与连续性
→ 作者可控AI候选
→ 校验、搜索、导入导出与恢复
→ 完整桌面体验
```

V1.0不做云存储/同步、账号后台、模型安装与运行时管理、向量数据库、多人协作、自动发布、无人审核批量生成和运营系统。

V1.5独立立项：L0—L5自动记忆、卷级检查点、定时项目日记、超长篇专项适配及有证据时的语义检索。

## 3. 五项不可变原则

1. 项目正文、设定、索引、日志和备份默认只在本机。
2. AI输出先成为Candidate，未经作者接受不能进入Draft。
3. `project.sqlite`是唯一项目数据真源。
4. 锁定、Revision、Hash、不可变Version、项目/路径和事务边界由代码保证。
5. AI只提议，作者拥有正文、Canon、状态和弧光的最终裁决权。

## 4. 总体架构

```text
Electron Main
  窗口、生命周期、OS集成、凭据Broker、Core监管

Preload
  具名白名单、边界校验、MessagePort桥

Renderer
  React、Tiptap、Zustand、用户交互、临时流展示
  禁止Node、SQLite、文件、环境变量和凭据

Core Service Utility Process
  唯一SQLite写者、文件、FTS、Provider、校验、导入导出、备份恢复
```

Core初期保持单一Utility Process，内部隔离网络异步流、SQLite单写队列和CPU任务。只有性能证据达到阈值时才拆分。

## 5. 仓库结构与职责

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

- contracts：strict Zod Schema、IPC、事件和错误码。
- domain：纯实体、不变量和纯函数。
- core-service：Repository、Migration、写队列、Provider、FTS、校验和文件Use Case。
- editor-core：Tiptap、Block Patch、锁定、Diff和中文编辑算法。
- prompts：Prompt Registry、约束序列化、解析和Cleaner。
- testkit：Fixture、Provider Stub、故障注入和临时项目。

## 6. V1.0九阶段路线

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与AI基础设施
→ M5 AI生成与候选审阅
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

任务索引：`docs/tasks/TASK_INDEX.md`。以下只描述阶段逻辑，具体范围以独立任务卡为准。

## 7. M0 工程、安全与运行底座

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

- `M0-01` Monorepo、质量工具与CI。
- `M0-02` Electron安全壳与Core生命周期。
- `M0-03` SQLite、Migration与单写队列。
- `M0-04` IPC、错误码、事件与任务协议。
- `M0-05` 测试基建、Fixture与故障注入。
- `M0-06` 显示、DPI与窗口恢复Spike。
- `M0-07` AI输出协议与中文Diff Spike。

阶段退出：仓库可安装、构建和测试；Electron、Core、SQLite、IPC及测试底座可运行；显示与AI/Diff风险有量化结论。

## 8. M1 基础写作MVP

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

- `M1-01` app.sqlite、应用设置与最近项目。
- `M1-02` 项目工作空间、路径边界与只读打开。
- `M1-03` 卷与章节基础生命周期。
- `M1-04` Draft、Tiptap与中文输入。
- `M1-05` Block Patch、内容Hash与Revision。
- `M1-06` 自动保存、字数与当前章查找。
- `M1-07` 手动Version、定稿与历史恢复。
- `M1-08` 基础恢复点、完整性检查与只读恢复。
- `M1-09` TXT与Markdown基础导入导出。

阶段退出：无AI完成项目、卷章、写作、自动保存、版本、导入导出和恢复，基础业务E2E通过。

## 9. M2 编辑安全与版本核心

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

- `M2-01` 锁定块与Core LockGuard。
- `M2-02` Candidate与完整Version模型。
- `M2-03` Diff、冲突、采用与持久化撤销。
- `M2-04` 回收站、拆章、并章与结构恢复。

阶段退出：所有正文修改受Patch、Revision、Hash和锁定保护；Candidate采用、冲突和回退可用。

## 10. M3 规划、设定与连续性

建立规划、设定与连续性权威数据，作者确认后才改变状态。

- `M3-01` 作品任务书与大纲树。
- `M3-02` SceneBeat、场景关联与跨章移动。
- `M3-03` 通用实体与静态Canon。
- `M3-04` 动态状态、时间线与知情信息。
- `M3-05` 伏笔生命周期与人物弧光。
- `M3-06` 状态提案、定稿、尾快照与失效传播。

阶段退出：规划与连续性成为权威数据；状态和弧光只经作者确认推进。

## 11. M4 检索与AI基础设施

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

- `M4-01` FTS5公共索引、队列与项目词典。
- `M4-02` P0—P4约束包与裁剪追溯。
- `M4-03` Provider、凭据与连接测试。
- `M4-04` Prompt Registry、输出Schema与Cleaner。
- `M4-05` GenerationRun、流式运行与模型支持档案。

阶段退出：FTS、约束包、Provider、Prompt、GenerationRun和Eval可复用；AI不可用不影响基础写作。

## 12. M5 AI生成与候选审阅

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

- `M5-01` T0多候选骨架。
- `M5-02` T1章节扩写。
- `M5-03` 快速改写与结构性改写。
- `M5-04` 多候选融合与部分结果恢复。
- `M5-05` 候选审阅、采用与冲突工作台。

阶段退出：T0/T1、改写、融合、审阅和采用全链路可用；失败、取消和partial不改变Draft。

## 13. M6 校验、搜索与交付

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

- `M6-01` 确定性/统计校验与修订待办。
- `M6-02` AI语义与人物弧光一致性校验。
- `M6-03` 全项目搜索与安全批量替换。
- `M6-04` 网文节奏与连载指标。
- `M6-05` DOCX安全导入与多格式导出。
- `M6-06` 三轨备份、恢复中心与空间清理。

阶段退出：校验、搜索、节奏、DOCX和三轨备份恢复完成；建议级功能不阻断写作。

## 14. M7 完整UI与体验整合

统一工作台、新手/专业模式、主题、无障碍和目标显示环境。

- `M7-01` 新手/专业模式、向导与三条创作路径。
- `M7-02` 统一工作台、沉浸视图与交互状态。
- `M7-03` 双视觉主题、无障碍与响应式验收。

阶段退出：统一工作台、模式、主题、无障碍和目标视口通过，UI不分叉业务逻辑。

## 15. M8 发布硬化与验收

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

- `M8-01` 安全、数据、Migration与隐私硬化。
- `M8-02` 性能、E2E、显示与AI Eval验收。
- `M8-03` 跨平台构建、P0追踪与发布关闭。

阶段退出：安全、数据、性能、E2E、跨平台和P0证据关闭，形成明确发布结论。

## 16. 基础写作MVP为什么独立

旧任务顺序把Volume/Chapter、恢复点、导入导出和完整UI分散到后期，导致基础产品无法形成阶段性交付。新M1固定顺序：

```text
项目首页与app.sqlite
→ 工作空间和路径边界
→ 卷章生命周期
→ Draft/Tiptap/中文输入
→ Block Patch/Revision
→ 自动保存/字数/当前章查找
→ 手动Version/定稿
→ 基础恢复点
→ TXT/Markdown导入导出
```

M1完成后即是一款无AI也能长期使用的本地写作软件。

## 17. 数据与事务规则

- app.sqlite只保存应用设置、最近项目、Provider元数据和窗口/UI偏好。
- project.sqlite保存项目权威数据。
- 所有写入通过Core单写队列。
- Draft Patch、Candidate采用、Version创建、状态提案解决、结构操作、导入和Migration必须单事务。
- 高风险操作先调用统一恢复点。
- Version不可变；恢复产生新Draft。
- FTS、统计、摘要和缓存可删除重建。

## 18. 编辑与Candidate规则

```text
编辑事务
→ Block Patch
→ baseRevision/expectedHash/LockGuard
→ 单事务
→ Revision +1
```

AI流程：

```text
约束包
→ GenerationRun
→ 临时流展示
→ Candidate
→ Diff/冲突
→ 作者选择
→ Block Patch
→ ApplyRecord/Checkpoint
```

任何失败、取消或断流都不能直接改变Draft。

## 19. Prompt与模型规则

- PromptDefinition包含promptId、version、taskType、inputSchema、outputSchema、build和supportedModes。
- T1优先支持纯文本流，只有稳定模型才使用结构化长正文。
- Cleaner只处理登记的协议外壳，不猜测重写无效JSON。
- 模型支持等级绑定Provider+Model+Task+PromptVersion。
- 未验证模型允许风险继续，但不得宣传稳定。

## 20. UI实施规则

- 每张用户功能任务同时完成最小UI。
- M7只统一导航、状态、主题和响应式。
- 新手/专业模式共用数据和Use Case。
- Theme A/Theme B只影响Token、资源和表现层。
- 覆盖空、加载、成功、失败、取消、冲突、只读和恢复。
- 核心路径支持1280×800、2K、21:9和混合DPI。

## 21. 标准任务循环

```text
确认ACTIVE_TASK与依赖
→ 检查真实仓库
→ 输出计划
→ 失败测试/复现
→ contracts/domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload
→ 最小UI
→ 失败/取消/冲突/恢复
→ 测试
→ 人工验收
→ 独立复查
→ 文档/追踪/证据
→ 关闭任务
```

## 22. 标准命令

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e
pnpm test:security
pnpm test:migration
pnpm test:perf
pnpm test:eval
```

命令尚未由基础任务建立时必须如实说明。

## 23. Definition of Done

任务只有同时满足以下条件才能关闭：

- 依赖已Verified。
- 目标真实接通，非目标未被引入。
- 用户功能有最小UI。
- 成功、失败、取消、冲突、只读和恢复路径已覆盖。
- Schema、Migration、IPC、Prompt、UI、安全和文档同步。
- 测试真实运行并记录退出状态。
- 证据位于`docs/test-evidence/<TASK-ID>/`。
- 追踪矩阵与任务索引已更新。
- 没有TODO、空实现、固定假数据和伪造成功。

## 24. V1.5启动门

V1.5只有在V1.0真实使用、已有中长篇数据且问题有可重复证据后启动。不得在V1.0任务中提前建设向量层、自动记忆调度、定时日记或超长篇专用架构。
