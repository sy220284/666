# WorldForge Prompt与AI评测规格

> 状态：Frozen  
> 目标：让Prompt、结构化输出、模型支持等级和回归评测可追踪、可复现、可降级。

## 1. 基本原则

1. Prompt是产品逻辑的一部分，必须版本化。
2. Prompt不能承担锁定、Revision、项目边界和Candidate隔离等安全保证。
3. AI质量指标与代码硬保证分开。
4. CI使用确定性Provider Stub验证协议和流程；真实模型Eval独立运行。
5. 支持等级绑定`Provider + Model + Task + PromptVersion`，不只绑定模型名称。
6. 未验证模型允许作者使用，但界面不得宣称稳定。
7. 模型质量不达标时降级或绕过AI路径，不阻止自主写作核心功能。

## 2. 目标目录

```text
packages/prompts/
├─ registry.ts
├─ schemas/
│  ├─ skeleton-output.ts
│  ├─ chapter-output.ts
│  ├─ rewrite-output.ts
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
├─ fixtures/
│  ├─ common/
│  ├─ male-channel/
│  ├─ female-channel/
│  ├─ continuity/
│  └─ safety/
├─ baselines/
├─ reports/
└─ model-support/
```

## 3. Prompt注册表

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

- `promptId`稳定，不因文字小改而更名。
- 任何影响输出语义或结构的变化递增`version`。
- 历史Prompt版本保留到相关Candidate和Eval不再需要读取。
- Prompt不得散落在React组件、Provider适配器和Repository中。

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

## 5. 通用输入

所有写作类任务共享：

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

Prompt只获得任务所需内容。锁定块正文是否发送由任务需要和隐私设置决定；无论是否发送，代码层都禁止修改。

## 6. T0骨架

### 输入

- ProjectBrief相关字段。
- 当前章节目标。
- SceneBeat及必选标记。
- 前章尾快照。
- 相关人物状态、知情和伏笔。
- 目标长度、叙事倾向和频道。

### 输出Schema

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

### 硬解析要求

- Schema有效率：100%。
- 所有必选`beatId`存在。
- 不允许输出正文全文冒充骨架。
- 无法解析时可执行一次明确的格式修复重试。

## 7. T1章节扩写

### 输入

- 选定或作者编辑后的骨架。
- 完整约束包。
- 目标字数范围。
- 文风配置和Few-shot样本。
- 禁止内容与必须发生内容。

### 输出

V1优先使用纯文本流，完成后解析为Block Candidate。若模型支持稳定结构化分块，可使用：

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

### 要求

- 不直接产生Draft Patch。
- 不生成“好的”“以下是正文”“本章完”等模型外壳。
- 必选事件和前章衔接由后置校验报告，不通过Prompt伪装为代码保证。

## 8. 快速改写

### 输入

- 当前单段选区。
- 同段完整内容。
- 前后各一段或最小语境。
- 任务指令。
- 人物、专名和当前状态最小约束。

### 输出

```ts
interface RewriteOutput {
  replacement: string;
  rationale?: string;
}
```

UI默认只展示replacement；rationale放在详情中。

### 要求

- 不新增未经请求的剧情事件。
- 保留专名、视角和时态。
- 长度超出轻量阈值时升级结构性Candidate。

## 9. 融合

输入包含多个Candidate的SceneBeat来源映射。输出必须是新的merge Candidate，不产生Patch。

重点检查：

- SceneBeat顺序。
- 重复事件。
- 指代和地点连续性。
- 拼接缝隙。
- 被要求保留的当前稿块。

## 10. AI语义校验

### 输出

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

要求：

- 没有证据ID的问题不得标高风险。
- 文案使用“可能”“建议核对”，不能冒充权威裁决。
- 校验结果不自动修改正文和设定。

## 11. 状态提取

### 输出

```ts
interface StateExtractionOutput {
  proposals: Array<{
    entityId: string;
    stateKey: string;
    previousValue?: unknown;
    proposedValue: unknown;
    evidenceBlockIds: string[];
    confidence: 'high' | 'medium' | 'low';
    changeType: 'create' | 'update' | 'close';
  }>;
}
```

要求：

- 无正文证据不得生成高置信提案。
- Canon变化单独形成冲突提示，不混入动态状态提案。
- 输出只进入StateProposal。

## 12. 输出清理

允许清理：

- 明确的Markdown代码块外壳。
- “以下是”“本章完”等登记在Cleaner规则中的模型废话。
- 首尾空白和已知协议标记。

禁止：

- 猜测并大幅重写无效JSON。
- 自动修正文内容以通过质量校验。
- 删除正文中真实需要的相似句式。

Cleaner规则必须有正反Fixture。

## 13. Eval Fixture

每个Fixture包含：

```yaml
id: continuity-001
language: zh-CN
channel: unspecified
task: chapter
input:
  project_brief: ...
  beats: ...
  current_states: ...
  knowledge_states: ...
  foreshadowing: ...
assertions:
  required_events: []
  forbidden_events: []
  required_names: []
  forbidden_knowledge_leaks: []
  expected_state_changes: []
```

Fixture不得使用用户私人作品。

## 14. Eval类型

### 14.1 协议Eval

使用Provider Stub，验证：

- Prompt注册。
- 请求映射。
- 流式事件。
- 取消、超时和断流。
- Schema解析和错误处理。

此类进入CI。

### 14.2 质量Eval

使用真实模型，验证：

- T0因果与节拍。
- T1事件覆盖和连续性。
- 快速改写保真。
- 状态提取精度。
- 禁止信息泄露。
- 中文文风和模型废话。

默认手动或受控运行，不在无密钥CI中执行。

### 14.3 回归Eval

Prompt、约束序列化、Cleaner、Provider映射或模型版本变化后运行对应Fixture集。

## 15. 评分维度

### T0

- Schema有效。
- 必选Beat覆盖。
- Beat顺序。
- 因果成立。
- 人物动机明确。
- 结尾钩子有效。
- 禁止事件未出现。

### T1

- 必须事件覆盖。
- 前文衔接。
- 人物状态一致。
- 知情边界。
- 伏笔要求。
- 设定偏离。
- 模型废话。
- 目标长度。

### 快速改写

- 指令完成。
- 含义保留。
- 专名保留。
- 无新增剧情事实。
- 长度变化。

### 状态提取

- Precision优先于Recall。
- 证据准确。
- current/historical判断。
- Canon误写率。

## 16. 建议基线

支持档案“已验证”的最低条件：

| 任务 | 最低要求 |
|---|---|
| T0 | Schema 100%；必选Beat≥95%；禁止事件泄露≤2% |
| T1 | 必须事件≥90%；明显前文断裂≤5%；专名错误≤2% |
| 快速改写 | 指令完成≥90%；新增剧情事实≤2% |
| 状态提取 | 高置信提案Precision≥95%；Canon直接提案=0 |
| 语义校验 | 高风险问题有证据=100%；无依据高风险=0 |

这些是模型质量基线，不降低代码硬保证。具体模型无法达到时标记“有限支持”。

## 17. 人工评审

自动评分无法可靠判断的内容：

- 文学质量。
- 人物魅力。
- 情绪递进。
- 真实网文追读体验。
- 文风是否具有作者个人特征。

真实模型升为“已验证”前，至少两名评审或作者本人对固定样本进行盲评。单人项目可以由作者重复评审不同时间批次，但需保留记录。

## 18. ModelSupportProfile

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

## 19. 报告

```text
evals/reports/<provider>/<model>/<task>/<prompt-version>/
├─ summary.json
├─ fixture-results.jsonl
├─ human-review.md
├─ failures/
└─ environment.md
```

报告不得包含用户真实项目正文和密钥。

## 20. Prompt变更流程

1. 修改Prompt或Schema。
2. 递增版本。
3. 更新Registry。
4. 运行单元与协议Eval。
5. 运行受影响真实模型回归Eval。
6. 对比旧基线。
7. 更新ModelSupportProfile。
8. 记录已知退化。

未运行真实模型Eval时，可以合并协议修复，但相关支持档案必须临时降为“未验证”或保留旧Prompt版本。

## 21. 禁止事项

- 在UI里临时拼接Prompt。
- Provider适配器根据模型名称偷偷修改业务语义。
- 通过隐藏失败Fixture提高平均分。
- 把AI自评分当成唯一质量结论。
- 使用用户作品作为公开测试夹具。
- 因模型不遵守指令而放松Candidate隔离或锁定保护。
