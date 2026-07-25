# M4-04 Prompt Registry、输出Schema与Cleaner

> 状态：Planned  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 建议分支：`work/m4-04-prompt-registry-output`

## 目标

在M0-07既有Spike级Prompt、Schema、Parser、Cleaner和模式选择代码基础上，建立生产级版本化Prompt体系，避免重复建设第二套注册、解析或清理逻辑。

## 阶段定位

承接M4-02约束包与M4-03 Provider能力，为GenerationRun、T0/T1、改写、融合、校验和状态提取提供可审计Prompt合同。

## 非目标

- 不在UI、Provider或Repository散落Prompt。
- 不把个人文风偏好硬编码为全局规则。
- 不持久化GenerationRun，不承担任务流式状态、取消或Candidate保存。
- 不重建M0-07已经验证的同类接口。

## 依赖

M4-02、M4-03、M0-07

## 承接基线

启动任务前必须复核并优先复用：

- `packages/prompts`现有`PromptDefinition`、`PromptBundle`和Registry。
- `m0.spike.skeleton`、`m0.spike.chapter`及其输入输出Schema。
- 现有`Cleaner`、结构化/纯文本Parser和一次受控格式修复。
- `selectChapterOutputMode`及既有`ModelSupportProfile`选择逻辑。
- M4-02生成的可追溯ConstraintPackage与稳定Hash。

基线不足时在现有包内演进，禁止并行建立新Prompt目录、新Registry或旁路Schema。

## 关联

- 需求：REQ-026、REQ-027、REQ-030
- 功能ID：AI-004—AI-008、AI-010基础
- 验收：P0-025—P0-028相关Eval

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/tasks/M0/M0-07_AI_DIFF_SPIKE.md`

## 主要影响范围

- `packages/prompts/`
- `packages/contracts/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- 仅在合同确有变化时同步相关AI、数据流和验收文档

## T1输入判别合同

```text
ChapterGenerationSource（每次请求恰好一种）
├─ skeleton_candidate
│  └─ selectedSkeletonCandidateId
├─ canonical_scene_beats
│  └─ sceneBeatIds[]
└─ direct_chapter_goal
   └─ chapterGoal
```

零来源、多来源、`sourceType`与字段不匹配均必须由严格Schema拒绝。Renderer不得通过字段优先级决定权威来源。

## 实施内容

1. 将M0-07的Spike实现升级为生产Prompt Registry；正式Prompt使用稳定`promptId`、整数`version`、`taskType`、输入输出Schema、构建器和支持模式。
2. 为Spike Prompt确定历史保留与生产ID迁移策略；历史版本必须可读取，重复`promptId + version`注册必须失败。
3. 在现有Cleaner和Parser上补齐受控协议外壳清理、严格解析、一次明确格式修复和安全失败；禁止猜测重写无效JSON。
4. 建立或生产化T0、T1、rewrite、merge、validate、state_extract输入输出合同。
5. T1输入使用显式判别联合；每次调用必须且只能选择Skeleton Candidate、权威SceneBeat或直接章节目标中的一种。允许作者绕过T0且SceneBeat为空，不得为满足Schema伪造节拍。
6. `state_extract`输出必须对齐当前StateProposal合同：数值型`confidence`、`EvidenceAnchor[]`、`validUntilChapterId`和`actualChapterId`；`previousValue`由Core读取权威状态，不由模型决定。
7. 纯文本与结构化模式继续按现有ModelSupportProfile策略选择，不强制未验证模型输出长正文JSON。
8. PromptBundle只生成本次调用所需的不可变Prompt元数据与约束引用；GenerationRun持久化归M4-05。
9. 所有Prompt变更绑定对应Eval、公开Fixture和兼容性回归。
10. 静态扫描确保Prompt、Schema构建和Cleaner规则没有散落到Renderer、Provider适配器或Repository。

## 测试与证据

- Spike兼容、生产ID迁移、版本并存、重复冲突、历史读取和占位符完整性。
- T1三种输入来源、无SceneBeat直接生成输入、零来源、多来源、字段错配和跨项目Skeleton引用拒绝。
- state_extract字段、证据锚点、有效期和弧光章节合同。
- 代码围栏、废话外壳、无效JSON、多JSON片段、一次格式修复和Cleaner正反Fixture。
- 纯文本/结构化模式选择与ModelSupportProfile匹配。
- 静态扫描Prompt不散落到UI和Provider。

证据保存到：`docs/test-evidence/M4-04/`

## 完成条件

- Prompt Registry可审计、可复现、可降级，并真实承接M0-07资产。
- T1三种来源在合同层互斥且完备，绕过T0不依赖伪造SceneBeat。
- state_extract输出与现有StateProposal合同一致。
- Prompt不承担锁定、Revision、项目边界、Candidate隔离或GenerationRun持久化。
- 未建立第二套Registry、Cleaner、Parser或模式选择系统。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的AI、Schema、IPC、UI、安全或测试文档。
