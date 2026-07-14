# WorldForge V1.0 Prompt与AI评测规格

> 状态：Frozen  
> 目标：Prompt、输出Schema、模型支持和回归评测可追踪、可复现、可降级。

## 1. 基本原则

1. Prompt是产品逻辑的一部分，必须版本化。
2. Prompt不能承担锁定、Revision、项目边界和Candidate隔离等代码保证。
3. CI使用确定性Provider Stub；真实模型Eval独立运行。
4. 支持等级绑定`Provider + Model + Task + PromptVersion`。
5. 模型质量不达标时降级或绕过，不阻止无AI写作。
6. 状态提取只能产生StateProposal，不能直接修改权威状态。

## 2. 目录

```text
packages/prompts/
├─ registry.ts
├─ schemas/
│  ├─ skeleton-output.ts
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

- promptId稳定；输出语义或结构变化递增整数version。
- 历史版本保留到相关Candidate和Eval不再需要读取。
- Prompt不得散落在React、Provider和Repository中。

## 4. PromptBundle

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

GenerationRun必须持久化metadata中的全部字段。

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

## 6. T0骨架

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

要求：Schema有效；必选beatId齐全；不输出整章正文；格式修复最多一次。

## 7. T1章节扩写

V1优先使用纯文本流，完成后解析为Block Candidate。稳定模型可使用：

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
- 必选事件、连续性和弧光阶段由后置校验报告，不伪装为代码保证。

## 8. 快速改写与结构性改写

```ts
interface RewriteOutput {
  replacement: string;
  rationale?: string;
}
```

快速改写只处理单段或受控轻量范围；跨段、跨场景或改变结构时升级为完整rewrite Candidate。

必须保留专名、视角、时态和已确认事实，不新增未经请求的剧情事件。

## 9. 多候选融合

输入包含多个Candidate的SceneBeat来源映射和需保留的当前稿块。

输出必须是新的merge Candidate，不直接产生Patch。检查SceneBeat顺序、重复事件、指代、地点连续性和拼接缝隙。

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
    confidence: 'high' | 'medium' | 'low';
  }>;
}
```

- 无证据ID的问题不得标高风险。
- 文案使用“可能”“建议核对”。
- 结果不自动修改正文、设定、状态或弧光。

## 11. 状态与弧光提取

状态提取输出采用可判别联合类型：

```ts
type StateProposalOutput =
  | {
      proposalType: 'entity_state';
      entityId: string;
      stateKey: string;
      previousValue?: unknown;
      proposedValue: unknown;
      evidenceBlockIds: string[];
      confidence: 'high' | 'medium' | 'low';
      changeType: 'create' | 'update' | 'close';
    }
  | {
      proposalType: 'arc_milestone';
      entityId: string;
      arcMilestoneId: string;
      previousStatus: 'planned';
      proposedStatus: 'hit' | 'skipped';
      evidenceBlockIds: string[];
      confidence: 'high' | 'medium' | 'low';
    };

interface StateExtractionOutput {
  proposals: StateProposalOutput[];
}
```

规则：

- 无正文证据不得生成高置信提案。
- Canon变化只生成冲突提示，不进入StateProposal。
- arcMilestoneId必须属于输入约束包中已存在且状态为planned的节点。
- 输出只进入`state_proposals`。
- pending提案不修改EntityState或ArcMilestone。

## 12. 节奏分析

RHY-001—004使用本地统计与语义校验组合：

- 爽点密度和更新节奏优先确定性统计。
- 章末钩子可使用语义校验，但必须给出正文证据。
- 黄金三章只对前3章运行。
- 所有结果为P3建议级，可关闭，不生成阻断严重度。
- GenreRhythmProfile阈值来自项目配置，不硬编码。

## 13. Cleaner

允许清理：

- 登记的Markdown代码块外壳。
- “以下是”“本章完”等登记废话。
- 首尾空白和已知协议标记。

禁止：

- 猜测并大幅重写无效JSON。
- 修改正文以通过质量校验。
- 删除正文中真实需要的相似句式。

Cleaner规则必须有正反Fixture。

## 14. Eval Fixture

每个Fixture至少包含：

```yaml
id: continuity-001
language: zh-CN
channel: unspecified
task: chapter
input:
  project_brief: ...
  beats: ...
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

## 15. Eval类型

### 15.1 协议Eval

进入CI：Prompt注册、请求映射、流式事件、取消、超时、断流、Schema解析、Cleaner和错误处理。

### 15.2 质量Eval

受控运行：

- T0因果、差异和SceneBeat覆盖。
- T1事件覆盖、连续性和专名。
- 快速改写保真与结构性改写边界。
- 融合来源、重复和过渡。
- EntityState提案Precision。
- ArcMilestone提案Precision和pending隔离。
- 人物弧光一致性。
- 节奏提示范围和证据。
- 禁止信息泄露和中文模型废话。

### 15.3 回归Eval

Prompt、约束序列化、Cleaner、Provider映射、Schema或模型版本变化后运行受影响Fixture。

## 16. 建议质量基线

| 任务 | 最低要求 |
|---|---|
| T0 | Schema 100%；必选Beat≥95%；禁止事件泄露≤2% |
| T1 | 必须事件≥90%；明显断裂≤5%；专名错误≤2% |
| 快速改写 | 指令完成≥90%；新增剧情事实≤2% |
| 状态提取 | 高置信EntityState提案Precision≥95%；Canon直接提案=0 |
| 弧光提取 | 高置信ArcMilestone提案Precision≥90%；未确认写入=0 |
| 语义校验 | 高风险问题有证据=100%；无依据高风险=0 |
| 节奏建议 | 超范围触发=0；关闭后触发=0 |

模型未达到时标记limited或untested，不降低代码硬保证。

## 17. ModelSupportProfile

```ts
interface ModelSupportProfile {
  providerId: string;
  model: string;
  taskType: string;
  promptId: string;
  promptVersion: number;
  status: 'verified' | 'limited' | 'untested';
  evaluatedAt?: string;
  fixtureSetVersion?: string;
  metrics?: Record<string, number>;
  limitations: string[];
}
```

## 18. 报告

```text
evals/reports/<provider>/<model>/<task>/<prompt-version>/
├─ summary.json
├─ fixture-results.jsonl
├─ human-review.md
├─ failures/
└─ environment.md
```

报告不得包含用户真实项目正文和密钥。

## 19. Prompt变更流程

1. 修改Prompt或Schema。
2. 递增整数版本。
3. 更新Registry。
4. 运行单元与协议Eval。
5. 运行受影响真实模型回归Eval。
6. 对比旧基线。
7. 更新ModelSupportProfile。
8. 记录已知退化。

禁止在UI拼接Prompt、按模型名偷偷改变业务语义、隐藏失败Fixture或用AI自评分作为唯一结论。
