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

## 依赖

M5-00、M4-05

## 承接基线

- 复用M2-02现有Candidate通用元数据、项目隔离、状态和生命周期。
- 复用M4-04 T0 Prompt与严格Schema。
- 复用M4-05 GenerationRun、生产Candidate创建入口和模型支持档案。
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
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
- `tests/e2e/`

## 数据模型调整

```text
Candidate通用元数据
├─ chapterId
├─ generationRunId
├─ baseDraftRevision
├─ completeness
└─ status

Skeleton Candidate
└─ structuredPayload
   ├─ titleSuggestion
   ├─ tendency
   ├─ beats[]
   │  ├─ beatId
   │  ├─ order
   │  ├─ event
   │  ├─ cause
   │  ├─ consequence
   │  ├─ informationReleased
   │  └─ characterIntentions
   ├─ endingHook
   └─ risks

Prose Candidate
└─ candidate_blocks[]
```

## 实施内容

1. 增加Skeleton Candidate判别式合同与必要Migration，结构化Payload必须独立持久化并严格校验。
2. 保持现有`full/rewrite/merge`使用CandidateBlock；禁止Skeleton复用正文块作为唯一真源。
3. 输入包含ProjectBrief、章节目标、必选SceneBeat、尾快照、状态、知情、伏笔、长度和频道。
4. 一次GenerationRun可生成多个Skeleton Candidate，每个候选保留Prompt、约束、Provider、Model和Run来源。
5. 校验全部必选SceneBeat覆盖、顺序、因果、结尾钩子和风险；禁止正文全文冒充骨架。
6. 作者编辑骨架时创建可追溯修订或派生记录，保留原始AI输出和作者修改后的权威选择。
7. T1通过Skeleton Candidate ID读取结构化骨架，禁止Renderer传递未持久化骨架全文作为权威输入。
8. Core层建立类型守卫：Skeleton对正文Preview、Diff、Apply、Version和定稿命令一律拒绝。
9. 生产Skeleton必须由M4-05正式Candidate入口创建并关联GenerationRun；Fixture接口仅限测试环境。
10. 无法解析时最多一次明确格式修复，失败返回稳定错误且不留下孤立Candidate。

## 测试与证据

- Schema迁移、结构化Payload完整往返、历史Candidate兼容和项目隔离。
- 必选节拍、因果、人物意图、信息释放、结尾钩子、风险、无效JSON、取消和多候选。
- 作者编辑后的来源追溯和T1按ID读取。
- Skeleton进入正文Diff、Apply、Version或定稿全部被Core拒绝。
- Run与多个Skeleton Candidate引用完整，无孤立记录。
- 相同Fixture回归Eval，未验证模型正确标识。
- 任何失败不改变Draft。

证据保存到：`docs/test-evidence/M5-01/`

## 完成条件

- M5-00已Verified，AI入口建立在已收口的作者工作流和统一用户语言层上。
- Skeleton结构化语义可无损持久化、编辑和追溯。
- Skeleton进入Draft或Version的成功次数为0。
- T0是可选低成本决策工具，不成为强制流程。
- 骨架Candidate可被M5-02通过ID读取。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
