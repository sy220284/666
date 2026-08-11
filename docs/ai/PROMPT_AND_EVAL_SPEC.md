# WorldForge V1.0 Prompt与AI评测规格

> 状态：Frozen  
> 目标：Prompt、输出Schema、模型支持和回归评测可追踪、可复现、可降级。  
> 更新日期：2026-07-25

## 1. 基本原则

1. Prompt是产品逻辑的一部分，必须版本化。
2. Prompt不能承担锁定、Revision、项目边界、Candidate类型和权威状态写入等代码保证。
3. CI使用确定性Provider Stub；真实模型Eval独立运行。
4. 支持等级绑定`Provider + Model + Task + PromptVersion`。
5. 模型质量不达标时降级或绕过，不阻止无AI写作。
6. AI正文输出只进入Candidate；状态提取只进入pending StateProposal。
7. `packages/prompts`是Prompt、Registry、Parser和Cleaner的唯一实现位置。
8. M4-04必须生产化M0-07既有Spike资产，禁止建立第二套Registry、Schema、Parser、Cleaner或模式选择逻辑。

## 2. 目录与承接关系

```text
packages/prompts/
├─ registry.ts
├─ types.ts
├─ mode-policy.ts
├─ schemas/
│  ├─ skeleton-input.ts
│  ├─ skeleton-output.ts
│  ├─ chapter-input.ts
│  ├─ chapter-output.ts
│  ├─ rewrite-output.ts
│  ├─ merge-output.ts
│  ├─ validation-output.ts
│  └─ state-proposal-output.ts
├─ templates/
│  ├─ skeleton/
│  ├─ chapter/
│  ├─ rewrite/
│  ├─ merge/
│  ├─ validation/
│  └─ state-extract/
├─ serializers/
├─ parsers/
└─ cleaners/

evals/
├─ fixtures/common/
├─ fixtures/male-channel/
├─ fixtures/female-channel/
├─ fixtures/continuity/
├─ fixtures/character-arc/
├─ fixtures/rhythm/
├─ fixtures/safety/
├─ baselines/
├─ reports/
└─ model-support/
```

M0-07已存在的`PromptDefinition`、`PromptBundle`、Skeleton/Chapter Spike、Parser、Cleaner和`selectChapterOutputMode`属于生产化输入，不得删除后另建平行体系。正式Prompt ID替代Spike ID时必须保留历史读取与兼容测试。

## 3. Prompt注册

```ts
interface PromptDefinition<TInput, TOutput> {
  promptId: string;
  version: number;
  taskType:
    | 'skeleton'
    | 'chapter'
    | 'rewrite'
    | 'merge'
    | 'validate'
    | 'state_extract';
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  build(input: TInput): PromptBundle;
  supportedModes: Array<'structured' | 'text'>;
}
```

规则：

- `promptId`稳定；输出语义或结构变化递增整数`version`。
- 同一`promptId + version`重复注册必须失败。
- 历史版本保留到相关Candidate、GenerationRun和Eval不再需要读取。
- Prompt不得散落在React、Provider、Repository或IPC Handler中。
- Registry必须支持按ID和版本精确读取，不以“最新版本”覆盖历史运行追溯。

## 4. PromptBundle与运行元数据

```ts
interface PromptBundle {
  system: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  structuredOutput?: {
    name: string;
    schema: Record<string, unknown>;
  };
  metadata: {
    promptId: string;
    promptVersion: number;
    taskType: string;
    constraintHash: string;
  };
}
```

PromptBundle只生成不可变调用元数据。M4-05的GenerationRun必须持久化：

- `promptId`、`promptVersion`、`taskType`；
- `constraintHash`、约束来源、来源Version和裁剪日志；
- Provider、实际Model、输出模式和ModelSupportProfile状态；
- 结果Candidate或StateProposal批次引用。

普通日志不得记录完整Prompt、约束全文或原始模型响应。

## 5. 通用写作输入

```ts
interface BaseWritingInput {
  projectId: string;
  chapterId: string;
  baseRevision: number;
  constraintPackage: ConstraintPackage;
  lockedBlockSummaries: Array<{
    logicalBlockId: string;
    purpose: string;
  }>;
  targetLanguage: string;
}
```

Prompt只获得任务所需内容。无论是否发送锁定块摘要，代码层都禁止修改锁定块。

## 6. T0结构化骨架

输入：ProjectBrief、章节目标、SceneBeat、前章连续性入口、人物状态、知情、伏笔、弧光阶段、目标长度和频道。

```ts
interface SkeletonCandidateOutput {
  titleSuggestion?: string;
  tendency: string;
  beats: Array<{
    beatId: string;
    order: number;
    event: string;
    cause: string;
    consequence: string;
    informationReleased: string[];
    characterIntentions: Array<{
      characterId: string;
      intention: string;
    }>;
    transitionToNext?: string;
  }>;
  endingHook: string;
  risks: string[];
}
```

要求：

- Schema有效；必选`beatId`齐全；不输出整章正文；格式修复最多一次。
- 每次运行可产生多个结构化Skeleton Candidate。
- Skeleton Payload独立持久化，不以普通正文块作为唯一真源。
- Skeleton可比较、编辑并作为T1输入。
- Skeleton进入正文Diff、Apply、Version或定稿必须由Core拒绝。

## 7. T1章节扩写

T1输入使用显式判别联合：

```ts
type ChapterGenerationSource =
  | {
      sourceType: 'skeleton_candidate';
      selectedSkeletonCandidateId: string;
    }
  | {
      sourceType: 'canonical_scene_beats';
      sceneBeatIds: string[];
    }
  | {
      sourceType: 'direct_chapter_goal';
      chapterGoal: string;
    };

interface ChapterPromptInput extends BaseWritingInput {
  source: ChapterGenerationSource;
  targetWordCount: number;
  styleInstructions?: string[];
}
```

规则：

- 作者可完全绕过T0。
- Skeleton路径必须按ID读取同项目、同章节、可用状态的持久化Skeleton。
- SceneBeat路径读取权威SceneBeat；不得由Renderer提交临时伪节拍。
- 无Skeleton、无SceneBeat时允许使用直接章节目标。
- 不得为满足Schema伪造SceneBeat。
- 实际使用的输入来源必须写入GenerationRun追溯。

V1优先使用纯文本流，完成后解析为Prose Candidate。稳定模型可使用：

```ts
interface ChapterCandidateOutput {
  blocks: Array<{
    temporaryId: string;
    beatId?: string;
    type: 'paragraph' | 'dialogue' | 'heading' | 'separator';
    content: string;
  }>;
}
```

要求：

- 不直接产生Draft Patch。
- 不输出“好的”“以下是正文”“本章完”等协议外壳。
- 完成后通过M4-05正式入口一次保存Prose Candidate。
- 必选事件、连续性和弧光阶段由后置校验报告，不伪装为代码保证。
- 取消或断流时，已接收文本只能由作者明确保存为partial或丢弃。
- partial不得默认整稿采用或直接定稿。

## 8. 快速改写与结构性改写

```ts
interface RewriteOutput {
  replacement: string;
  rationale?: string;
}
```

规则：

- 快速改写只处理单段或受控轻量范围。
- 每次可展示结果必须先形成持久化`rewrite` Candidate；Renderer内联预览不是权威结果。
- “换一个”创建新的GenerationRun与Candidate。
- 跨段、跨场景或改变结构时升级为完整rewrite Candidate。
- 必须保留专名、视角、时态和已确认事实，不新增未经请求的剧情事件。
- 应用继续复用M2-03 Diff、ConflictSet、LockGuard和ApplyRecord。

## 9. 多候选融合

输入包含多个Prose Candidate的SceneBeat来源映射和需保留的当前稿块。

规则：

- Skeleton Candidate不得作为正文拼接源。
- 输出必须是新的merge Candidate，不直接产生Patch。
- 检查SceneBeat顺序、重复事件、指代、地点连续性和拼接缝隙。
- 只生成必要过渡。
- 每个融合段可追溯到来源Candidate、来源SceneBeat和GenerationRun。
- 继续生成、手动补全、保存partial和丢弃属于产品流程；取消、delta终止和partial原子持久化归M4-05。

## 10. AI语义校验

```ts
interface SemanticValidationOutput {
  issues: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low' | 'info';
    logicalBlockId?: string;
    quote?: string;
    rationale: string;
    evidenceIds: string[];
    suggestion?: string;
    confidence: number;
  }>;
}
```

规则：

- `confidence`为0—1有限数值。
- 无证据ID的问题不得标高风险。
- 文案使用“可能”“建议核对”。
- 只读取已确认EntityState、ArcMilestone和有效快照。
- pending、rejected或旧Version StateProposal不得作为权威事实。
- stale快照必须回退权威查询并记录`snapshotSource`。
- 结果不自动修改正文、设定、状态或弧光。

## 11. 人物与世界整理提取

状态提取输出必须对齐当前StateProposalDraft合同：

```ts
interface EvidenceAnchor {
  kind: string;
  targetId: string;
}

type StateProposalOutput =
  | {
      proposalType: 'entity_state';
      entityId: string;
      stateKey: string;
      proposedValue: unknown;
      validUntilChapterId: string | null;
      evidence: EvidenceAnchor[];
      confidence: number;
    }
  | {
      proposalType: 'arc_milestone';
      arcMilestoneId: string;
      proposedStatus: 'hit' | 'skipped';
      actualChapterId: string | null;
      evidence: EvidenceAnchor[];
      confidence: number;
    }
  | KnowledgeStateProposal
  | TimelineEventProposal
  | CharacterRelationshipProposal
  | ForeshadowingProposal
  | EntityCreateProposal
  | CanonFactProposal;

interface StateExtractionOutput {
  proposals: StateProposalOutput[];
}
```

规则：

- 输入必须来自章节当前Final Version。
- 每条提案至少包含一个属于该Final Version的正文块证据锚点。
- `confidence`为0—1有限数值。
- `previousValue`和当前状态由Core读取权威数据计算，模型不得决定。
- EntityState有效期由Core验证章节区间。
- `arcMilestoneId`必须属于输入项目中状态为`planned`的节点。
- `hit`必须提供有效`actualChapterId`。
- 新类型按严格判别联合输出，未知字段、类型与目标不匹配或缺少必填字段均整批拒绝。
- 新Entity和CanonFact只形成待作者裁决建议，模型不得直接写Canon。
- 无效目标、跨项目引用、无证据、重复目标或非法区间整批拒绝。
- 所有类型统一写入`state_proposals`，以严格`target/proposedValue`判别结构表达目标和值；禁止建立平行Proposal表。
- pending提案不修改任何权威对象或EndingSnapshot，也不进入后续权威校验上下文。
- 接受、编辑接受和拒绝继续由作者通过M3-06既有Use Case执行。

## 12. 节奏分析

RHY-001—004使用本地统计与语义校验组合：

- 爽点密度和更新节奏优先确定性统计。
- 章末钩子可使用语义校验，但必须给出正文证据。
- 黄金三章只对前3章运行。
- 所有结果为P3建议级，可关闭，不生成阻断严重度。
- GenreRhythmProfile阈值来自项目配置，不硬编码。
- 人工写作字数和速度只统计`manual_edit`，排除AI采用、导入、替换、恢复、结构和系统操作。

## 13. Cleaner

允许清理：

- 登记的Markdown代码块外壳。
- “以下是”“本章完”等登记废话。
- 首尾空白和已知协议标记。

禁止：

- 猜测并大幅重写无效JSON。
- 修改正文以通过质量校验。
- 删除正文中真实需要的相似句式。
- 将多个不相关JSON片段拼成伪成功输出。

Cleaner规则必须有正反Fixture，并在现有Cleaner上扩展。

## 14. Parser与格式修复

- 结构化输出先执行严格Schema解析。
- 允许一次登记明确、可审计的格式外壳修复。
- 修复不得改变业务字段语义、补造缺失证据或推测目标ID。
- 一次修复后仍无效则返回稳定错误，不创建Candidate或StateProposal。
- 纯文本正文解析不得把协议说明、代码围栏或模型自述写入Candidate正文。

## 15. Eval Fixture

每个Fixture至少包含：

```yaml
id: continuity-001
language: zh-CN
channel: unspecified
task: chapter
input:
  project_brief: ...
  generation_source:
    source_type: direct_chapter_goal
    chapter_goal: ...
  current_states: ...
  confirmed_arc_milestones: ...
  knowledge_states: ...
  foreshadowing: ...
assertions:
  required_events: []
  forbidden_events: []
  required_names: []
  forbidden_knowledge_leaks: []
  expected_state_proposals: []
  expected_arc_proposals: []
```

Fixture不得使用用户私人作品。

## 16. Eval类型

### 16.1 协议Eval

进入CI：

- Prompt注册、版本读取和重复冲突；
- 三种T1输入来源与非法空联合；
- 请求映射、流式事件、取消、迟到delta、超时和断流；
- Schema解析、Cleaner、一次格式修复和错误处理；
- Skeleton持久化与Apply拒绝；
- Run与Candidate/StateProposal引用完整。

### 16.2 质量Eval

受控运行：

- T0因果、差异和SceneBeat覆盖。
- T1三路径事件覆盖、连续性和专名。
- 快速改写保真与结构性改写边界。
- 融合来源、重复和过渡。
- EntityState提案Precision、证据和有效期。
- ArcMilestone提案Precision、`actualChapterId`和pending隔离。
- 人物弧光一致性。
- 节奏提示范围和证据。
- 禁止信息泄露和中文模型废话。

### 16.3 回归Eval

Prompt、约束序列化、Cleaner、Parser、Provider映射、Schema或模型版本变化后运行受影响Fixture。

## 17. 建议质量基线

| 任务 | 最低要求 |
|---|---|
| T0 | Schema 100%；必选Beat≥95%；禁止事件泄露≤2%；Skeleton正文Apply=0 |
| T1 | 三路径可用；必须事件≥90%；明显断裂≤5%；专名错误≤2% |
| 快速改写 | 指令完成≥90%；新增剧情事实≤2%；未持久化展示结果=0 |
| 融合 | 来源映射完整=100%；明显重复与顺序错误≤5% |
| 状态提取 | 高置信EntityState提案Precision≥95%；证据有效=100%；Canon直接提案=0 |
| 弧光提取 | 高置信ArcMilestone提案Precision≥90%；未确认写入=0 |
| 语义校验 | 高风险问题有证据=100%；无依据高风险=0；pending作为事实=0 |
| 节奏建议 | 超范围触发=0；关闭后触发=0；非人工变更计入写作统计=0 |

模型未达到时标记`limited`或`unverified`，不降低代码硬保证。

## 18. ModelSupportProfile

```ts
interface ModelSupportProfile {
  providerId: string;
  model: string;
  taskType: string;
  promptId: string;
  promptVersion: number;
  status: 'verified' | 'limited' | 'unverified';
  evaluatedAt?: string;
  fixtureSetVersion?: string;
  metrics?: Record<string, number>;
  limitations: string[];
}
```

规则：

- 连接测试成功只能证明可达，不等于任务`verified`。
- Prompt版本或Schema变化后，旧Profile不能自动继承。
- 结构化长正文只在对应任务和Prompt版本的Schema成功率达到要求时启用。
- 支持等级必须能追溯到Eval报告。

## 19. 报告

```text
evals/reports/<provider>/<model>/<task>/<prompt-version>/
├─ summary.json
├─ fixture-results.jsonl
├─ human-review.md
├─ failures/
└─ environment.md
```

报告不得包含用户真实项目正文、完整Prompt、约束全文或密钥。

## 20. Prompt变更流程

1. 复核现有Registry、Schema、Parser、Cleaner和历史运行引用。
2. 修改Prompt或Schema。
3. 递增整数版本。
4. 更新Registry，保留历史版本读取。
5. 运行单元与协议Eval。
6. 运行受影响真实模型回归Eval。
7. 对比旧基线。
8. 更新ModelSupportProfile。
9. 记录已知退化和降级行为。
10. 同步任务卡、追踪矩阵和受影响专项文档。

禁止在UI拼接Prompt、按模型名偷偷改变业务语义、隐藏失败Fixture、建立第二套Prompt体系或用AI自评分作为唯一结论。
