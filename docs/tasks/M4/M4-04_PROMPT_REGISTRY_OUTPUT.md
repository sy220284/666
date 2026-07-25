# M4-04 WorldForge V1剩余功能整体实施与发布闭环

> 状态：In Progress  
> 里程碑：M4—M8 V1剩余功能整体交付  
> 优先级：P0  
> 最终任务：是  
> 正式分支：`work/m4-04-v1-integrated-delivery`

## 目标

在M0—M3与M4-01—M4-03已完成代码基础上，统一读取原M4-04—M8-03全部任务要求、权威规格、现有代码、测试、Migration、IPC与追踪状态，先完成整体规划，再在一个活动任务、一个正式分支和一个长期Draft PR中连续完成V1剩余功能、产品体验、发布硬化与最终验收。

本任务吸收原M4-05、M5-00—M5-06、M6-01—M6-06、M7-01—M7-03、M8-01—M8-03的全部目标、非目标、合同、测试和完成条件。被吸收文件继续作为需求来源，不再独立激活、切换状态、建立分支、PR或单独关闭。

## 整体推进方式

```text
一个活动任务：M4-04
→ 一个正式分支
→ 一个长期Draft PR
→ 先完成全量审计与整体规划
→ 按内部阶段连续实现
→ 内部阶段使用原子提交组
→ 每阶段代码审计与受影响回归
→ 全部完成后一次转Ready
→ 全部门禁通过后一次合并main
→ 一次整体Verified关闭
```

内部阶段只用于实施排序、风险控制和复查，不属于独立任务，不改变`ACTIVE_TASK`，不建立第二套任务状态机。

## 已完成基线

### 已Verified并冻结

- M0：工程、安全、SQLite、IPC、TaskProtocol、测试和AI Spike。
- M1：项目、卷章、正文、Patch、自动保存、Version、恢复和文本导入导出。
- M2：LockGuard、Candidate、Diff/Apply、撤销和结构恢复。
- M3：规划、SceneBeat、Canon、状态、伏笔、人物弧光、StateProposal、EndingSnapshot和React Renderer。
- M4-01：FTS5公共索引、队列、权威回读、项目隔离和项目词典。
- M4-02：P0—P4约束包、时序过滤、稳定Hash、冲突与裁剪追溯。
- M4-03：Provider适配器、凭据隔离、端点安全和连接测试。

历史任务卡、历史证据和已发布Migration保持冻结。需要扩展既有能力时，由本任务追加兼容合同、Migration和回归，不回写已完成任务卡。

### 必须复用，禁止重建

- 现有Prompt Registry、Cleaner、Parser、Schema、ProviderStub和模式选择。
- 现有TaskProtocol、MessagePort、delta批处理、背压、取消、订阅和任务快照。
- 现有Draft Patch、Revision、Hash、LockGuard、Candidate、Diff、ConflictSet、ApplyRecord和Checkpoint。
- 现有规划、SceneBeat、Entity、Canon、EntityState、KnowledgeState、Foreshadowing、CharacterArc、StateProposal和EndingSnapshot。
- 现有FTS、ConstraintPackage、Provider配置和凭据隔离。
- 现有CoordinatedImportExportService、ImportPlan和RecoveryService。
- 现有React Renderer、Tiptap、Zustand、Appearance和Theme状态。

禁止第二套Prompt系统、AI任务协议、Candidate采用逻辑、导入协调器、RecoveryService、模式状态源、主题业务分支或Renderer权威旁路。

## 被吸收需求来源

实施前必须完整读取并逐项映射：

- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`
- `docs/tasks/M5/M5-02_T1_CHAPTER_GENERATION.md`
- `docs/tasks/M5/M5-03_REWRITE_WORKFLOWS.md`
- `docs/tasks/M5/M5-04_CANDIDATE_MERGE_PARTIAL.md`
- `docs/tasks/M5/M5-05_CANDIDATE_REVIEW_APPLY.md`
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`
- `docs/tasks/M6/M6-01_RULE_STATS_VALIDATION_TODOS.md`
- `docs/tasks/M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md`
- `docs/tasks/M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md`
- `docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md`
- `docs/tasks/M6/M6-05_DOCX_TRANSFER.md`
- `docs/tasks/M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md`
- `docs/tasks/M7/M7-01_ONBOARDING_MODES_PATHS.md`
- `docs/tasks/M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md`
- `docs/tasks/M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`
- `docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md`
- `docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md`
- `docs/tasks/M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md`

吸收状态和统一归属以`docs/tasks/TASK_INDEX.md`为准。`Removed（absorbed）`只取消独立执行形式，不取消任何需求、测试和验收。

## 第一阶段：全量基线审计与整体规划

禁止直接开始新增功能代码。必须先在本任务文件的“执行附件”中完成：

1. 已有、部分实现、缺失、冲突和可复用能力清单。
2. 需求来源→用户路径→代码模块→测试→P0验收映射。
3. Contracts、Domain、Migration、Repository、Core、Main、Preload、Renderer纵向影响。
4. Prompt、GenerationRun、Candidate、StateProposal、ValidationIssue、导入和恢复共享合同总设计。
5. Migration编号、表、索引、兼容顺序、恢复和只读策略。
6. IPC、事件、错误码、Preload白名单和共享入口计划。
7. 完整用户路径及空、加载、成功、失败、取消、冲突、只读、恢复和重启状态。
8. 性能、安全、隐私、数据完整性、回滚和发布风险。
9. 内部阶段、原子提交组、测试路由和整体验收矩阵。
10. 禁止重复建设、临时旁路和悬空合同清单。

整体规划未完成、未复核或发现权威文档与真实代码冲突时，任务保持In Progress并先解决规划冲突。

## 第二阶段：AI公共合同与运行底座

1. 在M0-07既有Prompt资产上生产化T0、T1、rewrite、merge、validate、state_extract。
2. T1输入使用严格判别联合，每次恰好一种：Skeleton Candidate、权威SceneBeat或直接章节目标。
3. `state_extract`输出对齐当前StateProposal合同，`previousValue`由Core读取。
4. 建立GenerationRun权威持久化、Prompt/约束/Provider/Model/usage/error追溯。
5. 在既有TaskProtocol上增加兼容GenerationResultRef，区分Candidate和StateProposalBatch。
6. Run终态、结果记录与Candidate/批次原子收口，无孤立记录和伪成功。
7. 取消后阻止未来delta进入Renderer；重启只查询真实持久化状态。
8. partial只能由作者明确保存或丢弃。
9. 建立Skeleton/Prose Candidate判别模型，Skeleton禁止进入正文Preview、Diff、Apply、Version和定稿。
10. Generation IPC独立注册，普通日志不得记录正文、完整Prompt、约束全文、凭据或原始响应。

## 第三阶段：作者体验与AI写作闭环

1. 完成作者语言、任务导向导航、继续写作、正文中心布局、侧栏折叠、沉浸状态和单一模式状态源。
2. 常用设定使用中文结构化表单；高级原始数据视图与普通编辑分层。
3. 拆章、并章、跨章移动使用可视化预览，并继续受planHash、LockGuard、事务和恢复点保护。
4. T0生成多个可比较、可编辑、可追溯的结构化Skeleton Candidate。
5. T1支持Skeleton、SceneBeat、直接章节目标三条互斥路径，全部输出Prose Candidate。
6. 快速改写使用Revision、块Hash、范围和文本Hash锚点，最终转换为完整块Patch。
7. 结构性改写、Beat/Segment双模式融合、partial继续生成/手动补全/保存/丢弃形成完整流程。
8. 候选审阅显示来源、Diff、冲突、限制、采用摘要、撤销和恢复。
9. 所有AI结果先持久化，Renderer临时流和内联预览不成为权威数据。
10. 完整用户路径：项目→写作→T0可选→T1→改写/融合→审阅→采用→Version/定稿。

## 第四阶段：状态提取、校验与连续性闭环

1. 当前Final Version通过真实Provider执行`state_extract`。
2. 建立`source: provider`、StateProposalBatch和GenerationRun结果引用。
3. Provider结果只形成pending StateProposal；作者继续接受、编辑接受或拒绝。
4. AI直接写EntityState、ArcMilestone、EndingSnapshot的成功次数必须为0。
5. 建立确定性/基础统计校验、稳定ValidationAnchor、StoryTodo和Comment闭环。
6. 建立AI语义、设定、知情、伏笔、文风和人物弧光风险校验。
7. pending/rejected/旧Version提案不得进入权威事实区；stale快照必须权威回退。
8. 规则校验和AI校验复用统一ValidationIssue，不形成双真源。

## 第五阶段：搜索、统计、导入与恢复

1. 搜索Draft、只读Version和Entity；安全批量替换只作用于活动DraftBlock。
2. ReplacePlan提交前复核项目、Revision、Hash、范围、命中内容和LockGuard，并创建恢复点。
3. 建立Core决定的`mutationOrigin`：manual_edit、candidate_apply、import、safe_replace、structure、restore、system。
4. 人工作字数和有效写作速度只统计manual_edit，不混入AI、导入、替换、结构、恢复或系统操作。
5. 建立透明可配置的节奏、章末钩子、黄金三章和连载指标，全部为建议级。
6. DOCX安全解析复用既有ImportPlan、计划失效、路径复核、恢复点和单事务提交。
7. TXT/Markdown/DOCX导出只读取作者选定的不可变Version。
8. 三轨备份复用既有RecoveryService：日常滚动、重大操作恢复点、命名快照、配额清理和恢复新副本。
9. 最后已验证备份、关键Migration点和作者显式保留项不得被自动清理。

## 第六阶段：完整体验、硬化与发布关闭

1. 完整首次使用向导、快速/完整/导入/空白入口和自主/混合/AI初稿三条路径。
2. 全工作台接入、StatusArbiter、跨工作台返回原位置、上下文帮助和真实禁用原因。
3. Theme A/B、浅/深/护眼/高对比、减少动态、键盘、焦点、读屏和非颜色表达。
4. 1280×800、2K 100/125/150%、21:9和混合DPI终验。
5. Electron、IPC、Migration、Candidate、GenerationRun、StateProposal、隐私、凭据、网络和恢复硬门。
6. 完整性能、Electron E2E、AI Eval、模型支持档案和真实数据规模报告。
7. Windows、macOS、Linux构建、安装/升级/卸载、原生模块和安全降级验证。
8. P0-001—P0-075全部Verified或明确Blocked；输出允许发布、有条件允许或禁止发布结论。
9. 发现跨模块设计缺陷时回到本任务对应内部阶段整改并重跑受影响矩阵，不用临时补丁掩盖。

## 纵向闭环硬规则

每项用户功能必须按实际影响完成：

```text
Contracts
→ Domain（适用）
→ Migration / Repository（适用）
→ Core Use Case
→ Electron Main
→ Preload
→ Renderer
→ Unit / Integration / Migration / Security / E2E
→ 文档、追踪和证据
```

某层无影响时必须明确记录“无影响”。禁止只有接口、数据库、后台、UI或测试中的单层完成。

以下半成品不得进入最终Ready Head：

- Schema已变但Repository/Core/消费者未接。
- IPC已变但Main/Preload/Renderer未接。
- Candidate类型已变但Apply Guard未接。
- Migration已加但升级、恢复和兼容测试未接。
- UI入口已显示但真实能力未完成。
- Prompt已发布但Parser、Cleaner、Eval和运行追溯未同步。

## 主要影响范围

- `apps/`
- `packages/`
- `migrations/`
- `evals/`
- `tests/`
- `scripts/`
- `.github/workflows/`
- `.github/governance/`
- `docs/`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

已完成任务卡路径由`ACTIVE_TASK.forbiddenPaths`冻结；产品代码、权威规格和测试按真实影响同步。

## 分支、PR与提交规则

1. 正式分支固定为`work/m4-04-v1-integrated-delivery`。
2. 只建立一个正式Draft PR；辅助工作只能汇入该分支，不得直接向main提交其他功能PR。
3. PR在全部V1功能完成前保持Draft；Draft反馈不等于可合并。
4. 内部阶段使用可定位原子提交组，禁止逐文件调试提交和长期未解释的半成品提交。
5. 每个内部阶段结束后读取真实PR Head，完成横向/纵向代码审计、受影响测试和计划更新。
6. 未完成能力不得显示可用入口，不得保存半成品权威数据，不得要求后续阶段修复当前数据。
7. 全部功能、测试、文档和证据完成后才转Ready；六项永久门禁通过后一次受控合并。

建议提交组：

```text
规划：完成V1剩余功能全量基线与整体实施计划
基础：完成Prompt、GenerationRun与候选合同
功能：完成作者体验、T0/T1与候选生成
功能：完成改写、融合、审阅与安全采用
功能：完成状态提取与连续性校验
功能：完成搜索、统计、DOCX与三轨恢复
体验：完成向导、统一工作台、主题与无障碍
发布：完成安全、性能、E2E、跨平台与P0关闭
```

## 测试与证据

内部阶段按风险运行受影响套件；转Ready前必须运行完整矩阵：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:security`
- `pnpm test:e2e`
- `pnpm test:eval`
- `pnpm test:perf`
- `pnpm build`
- 发布阶段要求的跨平台构建和打包命令

统一证据目录：`docs/test-evidence/M4-04/`

至少包含：`summary.md`、`commands.txt`、`known-risks.md`、`manifest.json`、整体实施计划、测试矩阵、Migration报告、安全报告、性能报告和发布报告。

原被吸收任务不再建立独立Evidence关闭要求；其验收项映射到M4-04统一证据和P0矩阵。

## 完成条件

- 原M4-04—M8-03全部目标和P0验收均有实现、证据或明确Blocked结论。
- M0—M3与M4-01—M4-03已完成能力保持兼容，无历史任务卡和历史Migration被改写。
- 全部共享合同只有一个真源，无重复Prompt、运行时、Candidate采用、导入、恢复或UI状态系统。
- 所有用户功能形成真实纵向闭环，正式入口可达，未实现入口不可见或明确禁用。
- 无AI时项目创建、写作、保存、Version、导出和恢复完整可用。
- 所有Migration可从空库和支持的历史Schema顺序执行，失败可安全回滚或只读保护。
- Skeleton、partial、state_extract、pending提案、Revision、Hash、LockGuard和恢复不变量全部通过。
- 全量质量、安全、性能、Electron E2E、AI Eval和跨平台构建完成。
- 追踪矩阵、功能目录、P0矩阵、README、发布和恢复文档与真实代码一致。
- 无P0阻断问题；无法真实验证的发布项明确标记Blocked，不伪造成功。
- 最终任务关闭后不自动激活下一张任务。

## 执行附件

### 整体基线审计

待在正式M4-04分支开始编码前填写。

### 需求—代码—测试—P0映射

待在正式M4-04分支开始编码前填写。

### Migration、IPC与共享合同总计划

待在正式M4-04分支开始编码前填写。

### 风险、回滚与测试矩阵

待在正式M4-04分支开始编码前填写。
