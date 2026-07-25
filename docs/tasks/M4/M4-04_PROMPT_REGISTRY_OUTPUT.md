# M4-04 WorldForge V1剩余功能整体实施与发布闭环

> 状态：In Progress  
> 里程碑：M4—M8 V1剩余功能整体交付  
> 优先级：P0  
> 最终任务：是  
> 正式分支：`work/m4-04-v1-integrated-delivery`

## 目标

在M0—M3与M4-01—M4-03已完成代码基础上，统一读取原M4-04—M8-03全部任务要求、权威规格、现有代码、测试、Migration、IPC与追踪状态，先完成整体规划，再在一个活动任务、一个正式分支和一个长期Draft PR中连续完成V1剩余功能、产品体验、发布硬化与最终验收。

本任务吸收原M4-05、M5-00—M5-06、M6-01—M6-06、M7-01—M7-03、M8-01—M8-03的全部目标、非目标、合同、测试和完成条件。被吸收文件继续作为需求来源，不再独立激活、切换状态、建立分支或单独关闭。

## 整体推进原则

```text
一个活动任务：M4-04
→ 一个正式分支
→ 一个长期Draft PR
→ 先审计与整体规划
→ 按纵向闭环连续实现
→ 内部阶段使用原子提交组
→ 每阶段复查与受影响回归
→ 全部完成后一次转Ready
→ 全部门禁通过后一次合并main
→ 一次整体Verified关闭
```

内部实施阶段只用于排序、风险控制和复查，不属于独立任务，不改变`ACTIVE_TASK`，不建立第二套任务状态机。

## 依赖与已完成基线

### 已Verified并冻结

- M0-01—M0-07：工程、安全、SQLite、IPC、TaskProtocol、测试与AI Spike。
- M1-01—M1-09：项目、卷章、正文、Patch、自动保存、Version、恢复与文本导入导出。
- M2-01—M2-04：LockGuard、Candidate、Diff/Apply、撤销与结构恢复。
- M3-01—M3-10：规划、SceneBeat、Canon、动态状态、伏笔、人物弧光、StateProposal、EndingSnapshot与React Renderer。
- M4-01：FTS5公共索引、队列与项目词典。
- M4-02：P0—P4约束包、时序过滤、稳定Hash、冲突与裁剪追溯。
- M4-03：Provider适配器、凭据隔离、端点安全与连接测试。

历史任务卡、历史证据和已发布Migration保持冻结。需要扩展既有能力时，由本任务追加兼容合同、Migration和回归，不回写已完成任务卡。

### 禁止重复建设

- 第二套Prompt Registry、Cleaner、Parser或模型输出模式选择。
- 第二套TaskProtocol、流式事件、取消、背压或任务快照系统。
- 第二套Candidate采用、Diff、ConflictSet、ApplyRecord或撤销事务。
- 第二套导入计划、提交协调器或文本导入真源。
- 第二套RecoveryService、备份文件格式或恢复事务。
- 第二套新手/专业模式、主题或Renderer权威状态源。
- Renderer直连Node、SQLite、文件系统、凭据或Provider的旁路。

## 被吸收需求来源

实施前必须完整读取下列文件，并在整体实施计划中逐项建立映射：

- `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`（本任务）
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

统一吸收关系见：`docs/tasks/M4/M4-04_ABSORBED_REQUIREMENTS.md`。

## 第一阶段：全量基线审计与整体实施规划

禁止直接开始功能编码。必须先完成并审查：

`docs/tasks/M4/M4-04_INTEGRATED_IMPLEMENTATION_PLAN.md`

计划至少包含：

1. 已有、部分实现、缺失、冲突和可复用能力清单。
2. 需求来源→代码模块→用户路径→测试→P0验收映射。
3. Contracts、Domain、Migration、Repository、Core、Main、Preload、Renderer纵向影响。
4. Prompt、GenerationRun、Candidate、StateProposal、校验、导入、恢复等共享合同总设计。
5. Migration编号、表与兼容顺序；只追加、不改历史Migration。
6. IPC、事件、错误码、Preload白名单与共享入口计划。
7. 完整用户路径、空/加载/成功/失败/取消/冲突/只读/恢复状态。
8. 性能、安全、隐私、数据完整性和回滚风险。
9. 内部阶段、原子提交组、测试路由和整体验收矩阵。
10. 明确禁止重复建设、临时旁路和待后续修复的悬空合同。

计划未完成或发现权威文档与真实代码冲突时，任务保持In Progress并先解决规划冲突。

## 第二阶段：AI公共合同与运行底座

吸收原M4-04、M4-05及M5-01/M5-06所需基础：

1. 在M0-07既有Prompt资产上生产化T0、T1、rewrite、merge、validate、state_extract。
2. T1输入使用严格判别联合，每次恰好一种：Skeleton Candidate、权威SceneBeat或直接章节目标。
3. `state_extract`输出对齐当前StateProposal合同，旧值由Core读取。
4. 建立GenerationRun权威持久化、Prompt/约束/Provider/Model/usage/error追溯。
5. 在既有TaskProtocol上增加兼容的GenerationResultRef，区分Candidate和StateProposalBatch。
6. Run终态、结果记录与Candidate/批次原子收口；无孤立记录和伪成功。
7. 取消后阻止未来delta进入Renderer；重启只查询真实持久化状态。
8. partial只能由作者明确保存或丢弃。
9. 建立Skeleton/Prose Candidate判别模型基础，Skeleton禁止进入正文Preview、Diff、Apply、Version与定稿。
10. Generation IPC独立注册，日志不记录正文、完整Prompt、约束全文、凭据或原始响应。

## 第三阶段：作者体验与AI写作闭环

吸收原M5-00—M5-05：

1. 完成作者语言、任务导向导航、继续写作、正文中心布局、侧栏折叠、沉浸状态与单一模式状态源。
2. 常用设定使用中文结构化表单；高级原始数据视图与普通编辑分层。
3. 拆章、并章、跨章移动使用可视化预览，并继续受planHash、LockGuard、事务和恢复点保护。
4. T0生成多个可比较、可编辑、可追溯的结构化Skeleton Candidate。
5. T1支持Skeleton、SceneBeat、直接章节目标三条互斥路径，全部输出Prose Candidate。
6. 快速改写使用Revision、块Hash、范围和文本Hash锚点，最终转换为完整块Patch。
7. 结构性改写、Beat/Segment双模式融合、partial继续生成/手动补全/保存/丢弃形成完整流程。
8. 候选审阅显示来源、Diff、冲突、限制、采用摘要、撤销与恢复。
9. 所有AI结果先持久化，Renderer临时流和内联预览不成为权威数据。
10. 完整用户路径：项目→写作→T0可选→T1→改写/融合→审阅→采用→Version/定稿。

## 第四阶段：状态提取、校验与连续性闭环

吸收原M5-06、M6-01、M6-02：

1. 当前Final Version通过真实Provider执行`state_extract`。
2. 建立`source: provider`、StateProposalBatch与GenerationRun结果引用。
3. Provider结果只形成pending StateProposal；作者继续接受、编辑接受或拒绝。
4. AI直接写EntityState、ArcMilestone、EndingSnapshot的成功次数必须为0。
5. 建立确定性/基础统计校验、稳定ValidationAnchor、StoryTodo和Comment闭环。
6. 建立AI语义、设定、知情、伏笔、文风和人物弧光风险校验。
7. pending/rejected/旧Version提案不得进入权威事实区；stale快照必须权威回退。
8. 规则校验和AI校验复用统一ValidationIssue，不形成双真源。

## 第五阶段：搜索、统计、导入与恢复

吸收原M6-03—M6-06：

1. 搜索Draft、只读Version和Entity；安全批量替换只作用于活动DraftBlock。
2. ReplacePlan提交前复核项目、Revision、Hash、范围、命中内容和LockGuard，并创建恢复点。
3. 建立Core决定的`mutationOrigin`：manual_edit、candidate_apply、import、safe_replace、structure、restore、system。
4. 人工作字数和有效写作速度只统计manual_edit，不混入AI、导入、替换、结构、恢复或系统操作。
5. 建立透明可配置的节奏、章末钩子、黄金三章与连载指标，全部为建议级。
6. DOCX安全解析复用既有ImportPlan、计划失效、路径复核、恢复点和单事务提交。
7. TXT/Markdown/DOCX导出只读取作者选定的不可变Version。
8. 三轨备份复用既有RecoveryService：日常滚动、重大操作恢复点、命名快照、配额清理和恢复新副本。
9. 最后已验证备份、关键Migration点和作者显式保留项不得被自动清理。

## 第六阶段：完整体验、硬化与发布关闭

吸收原M7-01—M8-03：

1. 完整首次使用向导、快速/完整/导入/空白入口与自主/混合/AI初稿三条路径。
2. 全工作台接入、StatusArbiter、跨工作台返回原位置、上下文帮助和真实禁用原因。
3. Theme A/B、浅/深/护眼/高对比、减少动态、键盘、焦点、读屏与非颜色表达。
4. 1280×800、2K 100/125/150%、21:9和混合DPI终验。
5. Electron、IPC、Migration、Candidate、GenerationRun、StateProposal、隐私、凭据、网络和恢复硬门。
6. 完整性能、Electron E2E、AI Eval、模型支持档案和真实数据规模报告。
7. Windows、macOS、Linux构建、安装/升级/卸载、原生模块和安全降级验证。
8. P0-001—P0-075全部Verified或明确Blocked；输出允许发布、有条件允许或禁止发布结论。
9. 发现跨模块设计缺陷时回到本任务对应内部阶段整改并重跑受影响矩阵，不在发布末尾用临时补丁掩盖。

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
→ 文档、追踪与证据
```

某层无影响时必须在整体计划和完成报告中明确写“无影响”。禁止只有接口、数据库、后台、UI或测试中的单层完成。

以下半成品不得进入最终Ready Head：

- Schema已变但Repository/Core/消费者未接。
- IPC已变但Main/Preload/Renderer未接。
- Candidate类型已变但Apply Guard未接。
- Migration已加但升级、恢复与兼容测试未接。
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
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

已完成任务卡路径由`ACTIVE_TASK.forbiddenPaths`冻结；产品代码、权威规格和测试可按本任务真实影响同步。

## 分支、PR与提交规则

1. 正式分支固定为`work/m4-04-v1-integrated-delivery`。
2. 只建立一个正式Draft PR；辅助工作只能汇入该分支，不得直接向main提交其他功能PR。
3. PR在全部V1功能完成前保持Draft；Draft反馈不等于可合并。
4. 内部阶段使用可定位原子提交组，禁止逐文件调试提交和长期未解释的半成品提交。
5. 每个内部阶段结束后读取真实PR Head，完成横向/纵向代码审计、受影响测试和计划账本更新。
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
- 发布阶段要求的跨平台构建/打包命令

统一证据目录：`docs/test-evidence/M4-04/`

至少包含：

- `summary.md`
- `commands.txt`
- `known-risks.md`
- `manifest.json`
- `implementation-plan.md`
- `test-matrix.md`
- `migration-report.md`
- `security-report.md`
- `performance-report.md`
- `release-report.md`

原被吸收任务不再建立独立Evidence关闭要求；其验收项必须映射到M4-04统一证据与P0矩阵。

## 完成条件

只有同时满足以下条件，才能标记Implemented或Verified：

- 原M4-04—M8-03全部目标和P0验收均有实现、证据或明确Blocked结论。
- M0—M3与M4-01—M4-03已完成能力保持兼容，无历史任务卡和历史Migration被改写。
- 全部共享合同只有一个真源，无重复Prompt、运行时、Candidate采用、导入、恢复或UI状态系统。
- 所有用户功能形成真实纵向闭环，正式入口可达，未实现入口不可见或明确禁用。
- 无AI时项目创建、写作、保存、Version、导出和恢复完整可用。
- 所有Migration可从空库和支持的历史Schema顺序执行，失败可安全回滚或只读保护。
- Skeleton、partial、state_extract、pending提案、Revision、Hash、LockGuard和恢复不变量全部通过。
- 全量质量、安全、性能、Electron E2E、AI Eval和跨平台构建完成。
- 追踪矩阵、功能目录、P0矩阵、README、发布与恢复文档与真实代码一致。
- 无P0阻断问题；任何无法真实验证的发布项明确标记Blocked，不伪造成功。
- 最终任务关闭后不自动激活下一张任务。
