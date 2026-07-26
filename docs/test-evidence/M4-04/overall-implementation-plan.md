# M4-04 整体基线审计与实施计划

> 状态：规划基线完成
>
> 审计基线：`bf557fb2d3cb4a4911e75d5cc5e722ed847932d9`
>
> 正式分支：`work/m4-04-v1-integrated-delivery`
>
> 适用范围：M4-04吸收的原M4-05—M8-03全部V1剩余需求

## 1. 权威顺序

实施判断统一遵循：

1. 作者最新明确指令。
2. `ACTIVE_TASK.json`、M4-04任务卡及本次执行附件。
3. V6.5完整规格、功能目录、需求追踪矩阵和P0矩阵。
4. Database、IPC、Event、Error、Prompt、Provider、安全、隐私、UI和性能专项真源。
5. 冻结实现决策。
6. 当前代码、测试和Migration。

被吸收任务卡只提供需求来源，不独立激活、建分支、建PR、建Evidence或关闭。

## 2. 代码基线

| 层        | 已完成且直接复用                                                                | 兼容扩展点                                                              | 当前缺口                                                   |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Contracts | strict Schema、Error Code、Task Event、Draft、Candidate、Recovery、ImportExport | TaskProtocol、Candidate、StateProposal、Search、AppSettings             | Generation、Validation、Rhythm正式合同                     |
| Core      | Workspace、单写队列、Draft Patch、Version、Candidate Diff/Apply/Undo、结构操作  | TaskProtocol、Search、Constraint、StateProposal、ImportExport、Recovery | GenerationRuntime、SafeReplace、Validation、WritingMetrics |
| Prompt    | Registry、Bundle、Cleaner、Parser、模式选择、Stub Eval                          | Spike资产生产化                                                         | rewrite、merge、validate、state_extract生产Prompt          |
| Main      | CoreSupervisor、Provider、CredentialBroker、现有业务IPC                         | 独立Generation IPC和新业务IPC模块                                       | AI运行编排入口                                             |
| Preload   | 严格白名单、Result Schema、Task MessagePort                                     | 新域桥接                                                                | Generation/Search/Validation/Rhythm完整桥                  |
| Renderer  | React、Tiptap、Zustand、AppShell、Writing/Planning/Canon/DataTools              | 继续写作、检查工作台、候选和恢复体验                                    | T0/T1、改写、融合、校验、项目搜索、Onboarding              |
| Database  | App Schema 2、Project Schema 21                                                 | 追加Migration                                                           | Generation、结构化Skeleton、Validation、Metrics、三轨备份  |
| Tests     | Unit、Integration、Migration、Security、Electron E2E、Performance、Eval         | 按阶段增加永久用例                                                      | M4-04整体矩阵与最终Evidence                                |

## 3. 已确认的实现差异

1. `candidates.generation_run_id`已有字段，但`generation_runs`表和权威服务不存在。
2. Candidate枚举包含`skeleton`，现有CandidateDocument和创建输入仍要求至少一个正文块。
3. Candidate Apply对partial整稿已有保护，但缺少Skeleton进入正文链路的显式拒绝。
4. TaskProtocol已具备delta批处理、背压、取消和快照，结果仍只有Candidate ID且全部保存在内存。
5. StateProposal已具备pending、作者裁决和EndingSnapshot事务，来源只允许`rule/provider_stub`且无Batch。
6. Search已覆盖Draft、Version、Entity及短词回退，但未进入Utility服务集合和桌面公开调用链。
7. ConstraintPackage已完成P0—P4、裁剪和时序回退，尚未按GenerationRun持久化调用快照。
8. ImportExport只有TXT/Markdown；Recovery只有基础Checkpoint和恢复副本。
9. `ModelSupportProfile.status`代码使用`untested`，冻结Prompt规格使用`unverified`。
10. Renderer编辑选区只在进程内Map保存，无法形成重启后的继续写作状态。
11. Beginner/Professional、Theme A/B和StatusArbitrator已有单一状态源，只需扩展消费者。
12. “检查”主导航仍不可用，必须在完整能力落地后再开放。

## 4. 内部检查点

| 检查点 | 交付范围                                                      | 完成门槛                                    |
| ------ | ------------------------------------------------------------- | ------------------------------------------- |
| C0     | 本规划、四项附件、统一Evidence骨架、长期Draft PR              | 治理校验通过，无产品代码                    |
| C1     | 作者工作流基础：继续写作、作者语言、结构化表单、结构操作预览  | 无AI路径可完整创建项目并进入写作            |
| C2     | GenerationRun、生产Prompt、ModelSupport、TaskProtocol结果引用 | Stub端到端运行、取消、partial、重启一致     |
| C3     | T0结构化Skeleton与T1三种互斥来源                              | Skeleton零正文采用，T1只生成Prose Candidate |
| C4     | 快速/结构改写、融合、完整候选审阅与采用                       | Revision/Hash/Lock/Checkpoint/Undo全部复用  |
| C5     | Provider状态提取、StateProposalBatch、规则与AI Validation     | AI零权威直写，Issue/Todo/Comment闭环        |
| C6     | 项目搜索、安全替换、写作会话、节奏与黄金三章                  | 七类mutationOrigin与P3建议边界通过          |
| C7     | DOCX导入导出与三轨备份恢复                                    | 恶意DOCX零写入，最后已验证备份不可清理      |
| C8     | Onboarding、统一工作台、主题、无障碍、DPI、发布关闭           | P0-001—P0-075有证据或明确Blocked            |

## 5. 原子提交组

每个检查点允许多个小提交，但必须保持下列顺序：

1. 共享合同及兼容解析。
2. Migration与Repository/Core消费方。
3. Main、Preload和Renderer纵向入口。
4. Unit、Integration、Migration、Security和E2E。
5. 受影响文档、矩阵和阶段Evidence。
6. 阶段代码审计与回归修复。

禁止长期保留以下状态：

- Schema已合并而Core无消费方。
- IPC已注册而Preload或Renderer无正式入口。
- UI按钮可点击而后台仍为Fixture或占位实现。
- Prompt已生产化而Parser、Cleaner、Eval和Run追溯未同步。
- Candidate类型已扩展而Apply、Version和Final Guard未扩展。

## 6. 模块落点

### Contracts

- 扩展：`task-protocol.ts`、`candidate.ts`、`state-proposal.ts`、`search-index.ts`、`import-export.ts`、`recovery.ts`、`app-data.ts`、`error-codes.ts`。
- 新增：`generation.ts`、`validation.ts`、`rhythm.ts`。
- 所有新增域从`packages/contracts/src/index.ts`统一导出。

### Core

- 新增：GenerationRun/Runtime、Validation、SafeReplace、WritingMetrics服务。
- 扩展：Candidate、CandidateApply、TaskProtocol、StateProposal、SearchIndex、CoordinatedImportExport、Recovery。
- 新服务进入`UtilityProjectServices`和既有Project Router，不增加第二个Core进程。

### Desktop

- Main按域拆分Generation、Search、Validation/Rhythm IPC，避免继续膨胀通用`ipc-handlers.ts`。
- Preload按域增加严格桥接并同步Security测试。
- Renderer继续复用AppShell、Writing、Planning、Canon、DataTools、UI Store和StatusArbitrator。

## 7. 阶段状态规则

- C0完成只表示规划完成，任何产品需求不得因此改为Implemented。
- 内部检查点完成后可更新具体需求状态，但必须附代码和测试证据。
- 长期PR保持Draft，直到C8全量验收完成。
- 最终Head发生变化后，受影响Evidence必须重新生成并绑定新Head。
- 最终任务关闭后保持无活动后继任务。
