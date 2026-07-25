# M5-01 T0多候选骨架

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-01-t0-skeleton`

## 目标

基于章节目标、SceneBeat和约束包生成多个可比较、可编辑、可追溯的结构化Skeleton Candidate，并补齐现有Candidate模型无法承载骨架语义的缺口。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。M5-01负责骨架Candidate的数据扩展和产品流程，不回写M2历史任务卡。

## 非目标

- 不直接生成或修改Draft。
- 不允许Skeleton进入正文Diff、Apply或定稿。
- 不强制作者使用T0。
- 不重建M4-05 GenerationRun或M2-03采用引擎。
- 不把结构化骨架压成伪正文块以满足旧Schema。

## 依赖

M5-00、M4-05

## 承接基线

- 复用M2-02现有Candidate通用元数据、项目隔离、状态和生命周期。
- 复用M4-04 T0 Prompt与严格Schema。
- 复用M4-05 GenerationRun、通用结果引用、生产Candidate创建入口和模型支持档案。
- 现有`candidate_blocks`继续只承载Prose Candidate，不把结构化骨架压成正文块。

## 关联

- 需求：REQ-026
- 功能ID：AI-004
- 验收：P0-025

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`

## 主要影响范围

- `migrations/project/`
- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `packages/editor-core/`中的Candidate类型守卫
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`

## 判别式数据模型

```text
Candidate通用元数据
├─ candidateId
├─ chapterId
├─ generationRunId
├─ baseDraftId
├─ baseDraftRevision
├─ completeness
├─ status
├─ title
└─ candidateType

SkeletonCandidateDocument
├─ candidateType: skeleton
├─ payloadSchemaVersion
├─ structuredPayload
│  ├─ titleSuggestion
│  ├─ tendency
│  ├─ beats[]
│  │  ├─ beatId
│  │  ├─ order
│  │  ├─ event
│  │  ├─ cause
│  │  ├─ consequence
│  │  ├─ informationReleased
│  │  └─ characterIntentions
│  ├─ endingHook
│  └─ risks
├─ payloadHash
└─ blocks字段禁止出现

ProseCandidateDocument
├─ candidateType: full | rewrite | merge
├─ blocks[]
└─ structuredPayload字段禁止出现
```

Skeleton的`contentHash`必须由版本化规范序列化后的结构化Payload计算；`blockCount`对Skeleton为0或从判别联合中移除，不得维持“必须大于0”的旧假设。

## 生命周期与过期语义

- `baseDraftRevision`用于记录生成时上下文，不等同于正文采用基线。
- 章节、SceneBeat或约束来源变化后，旧Skeleton仍可读取和比较，但必须标记来源过期状态，进入T1前由Core明确复核。
- 作者编辑Skeleton必须创建可追溯修订或派生记录，保留原始AI输出、作者修改版本、父来源和当前选定版本。
- T1只读取同项目、同章节、状态可用且通过当前来源复核的持久化Skeleton ID。

## 实施内容

1. 增加Skeleton/Prose Candidate判别式合同与追加Migration，结构化Payload独立持久化、版本化并严格校验。
2. 修正现有Candidate摘要和文档Schema对`blocks.min(1)`、`blockCount.positive()`的通用假设；Prose继续要求至少一个合法块，Skeleton禁止出现正文块。
3. 为Skeleton定义稳定规范序列化、`payloadHash`和聚合`contentHash`计算，读取时重新校验，损坏数据不得进入T1。
4. 保持现有`full/rewrite/merge`使用CandidateBlock；禁止Skeleton复用正文块作为唯一真源。
5. 输入包含ProjectBrief、章节目标、必选SceneBeat、尾快照、状态、知情、伏笔、长度和频道。
6. 一次GenerationRun可生成多个Skeleton Candidate，每个候选保留Prompt、约束、Provider、Model和Run来源。
7. 校验全部必选SceneBeat覆盖、顺序、因果、结尾钩子和风险；禁止正文全文冒充骨架。
8. 作者编辑骨架时创建可追溯修订或派生记录，保留原始AI输出和作者修改后的权威选择。
9. T1通过Skeleton Candidate ID读取结构化骨架，禁止Renderer传递未持久化骨架全文作为权威输入。
10. Core层建立类型守卫：Skeleton对正文Preview、Diff、Apply、Version和定稿命令一律拒绝。
11. 生产Skeleton必须由M4-05正式Candidate入口创建并关联GenerationRun及`candidate`结果引用；Fixture接口仅限测试环境。
12. 无法解析时最多一次明确格式修复，失败返回稳定错误且不留下孤立Candidate。

## 测试与证据

- Schema迁移、判别联合、结构化Payload完整往返、历史Prose Candidate兼容和项目隔离。
- Skeleton无Blocks、Prose无structuredPayload、Skeleton `blockCount`兼容和Hash损坏拒绝。
- 必选节拍、因果、人物意图、信息释放、结尾钩子、风险、无效JSON、取消和多候选。
- 作者编辑修订、父来源追溯、旧来源过期提示和T1按ID读取。
- Skeleton进入正文Preview、Diff、Apply、Version或定稿全部被Core拒绝。
- Run与多个Skeleton Candidate引用完整，无孤立记录。
- 相同Fixture回归Eval，未验证模型正确标识。
- 任何失败不改变Draft。

证据保存到：`docs/test-evidence/M5-01/`

## 完成条件

- M5-00已Verified，AI入口建立在已收口的作者工作流和统一用户语言层上。
- Skeleton结构化语义可无损持久化、编辑、校验Hash和追溯。
- Skeleton与Prose使用严格判别合同，不存在伪正文块或双真源。
- Skeleton进入Draft、Preview、Diff、Apply、Version或定稿的成功次数为0。
- T0是可选低成本决策工具，不成为强制流程。
- 骨架Candidate可被M5-02通过ID读取并复核来源状态。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
