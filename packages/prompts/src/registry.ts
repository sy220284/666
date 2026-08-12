import {
  ChapterCandidateJsonSchema,
  ChapterCandidateOutputSchema,
  ChapterPromptInputSchema,
  MergePromptInputSchema,
  ProductionChapterPromptInputSchema,
  ProductionSkeletonPromptInputSchema,
  RewriteOutputJsonSchema,
  RewriteOutputSchema,
  RewritePromptInputSchema,
  SemanticValidationOutputJsonSchema,
  SemanticValidationOutputSchema,
  SemanticValidationPromptInputSchema,
  SkeletonCandidateBatchJsonSchema,
  SkeletonCandidateBatchOutputSchema,
  SkeletonCandidateJsonSchema,
  SkeletonCandidateOutputSchema,
  SkeletonPromptInputSchema,
  StateExtractionOutputJsonSchema,
  StateExtractionOutputSchema,
  StateExtractionPromptInputSchema,
  type ChapterCandidateOutput,
  type ChapterPromptInput,
  type MergePromptInput,
  type ProductionChapterPromptInput,
  type ProductionSkeletonPromptInput,
  type RewriteOutput,
  type RewritePromptInput,
  type SemanticValidationOutput,
  type SemanticValidationPromptInput,
  type SkeletonCandidateBatchOutput,
  type SkeletonCandidateOutput,
  type SkeletonPromptInput,
  type StateExtractionOutput,
  type StateExtractionPromptInput,
} from '@worldforge/contracts';

import {
  definePrompt,
  withPromptIdentity,
  type PromptBundle,
  type PromptIdentity,
} from './types.js';

export const SKELETON_SPIKE_PROMPT_ID = 'm0.spike.skeleton' as const;
export const CHAPTER_SPIKE_PROMPT_ID = 'm0.spike.chapter' as const;
export const SKELETON_PROMPT_ID = 'worldforge.skeleton' as const;
export const CHAPTER_PROMPT_ID = 'worldforge.chapter' as const;
export const REWRITE_PROMPT_ID = 'worldforge.rewrite' as const;
export const MERGE_PROMPT_ID = 'worldforge.merge' as const;
export const VALIDATE_PROMPT_ID = 'worldforge.validate' as const;
export const STATE_EXTRACT_PROMPT_ID = 'worldforge.state-extract' as const;

export const SKELETON_SPIKE_PROMPT_IDENTITY = {
  promptId: SKELETON_SPIKE_PROMPT_ID,
  version: 1,
  taskType: 'skeleton',
} as const satisfies PromptIdentity;
export const CHAPTER_SPIKE_PROMPT_IDENTITY = {
  promptId: CHAPTER_SPIKE_PROMPT_ID,
  version: 1,
  taskType: 'chapter',
} as const satisfies PromptIdentity;
export const SKELETON_PROMPT_IDENTITY = {
  promptId: SKELETON_PROMPT_ID,
  version: 1,
  taskType: 'skeleton',
} as const satisfies PromptIdentity;
export const CHAPTER_PROMPT_IDENTITY = {
  promptId: CHAPTER_PROMPT_ID,
  version: 1,
  taskType: 'chapter',
} as const satisfies PromptIdentity;
export const REWRITE_PROMPT_IDENTITY = {
  promptId: REWRITE_PROMPT_ID,
  version: 1,
  taskType: 'rewrite',
} as const satisfies PromptIdentity;
export const MERGE_PROMPT_IDENTITY = {
  promptId: MERGE_PROMPT_ID,
  version: 1,
  taskType: 'merge',
} as const satisfies PromptIdentity;
export const VALIDATE_PROMPT_V1_IDENTITY = {
  promptId: VALIDATE_PROMPT_ID,
  version: 1,
  taskType: 'validate',
} as const satisfies PromptIdentity;
export const VALIDATE_PROMPT_IDENTITY = {
  promptId: VALIDATE_PROMPT_ID,
  version: 2,
  taskType: 'validate',
} as const satisfies PromptIdentity;
export const STATE_EXTRACT_PROMPT_V1_IDENTITY = {
  promptId: STATE_EXTRACT_PROMPT_ID,
  version: 1,
  taskType: 'state_extract',
} as const satisfies PromptIdentity;
export const STATE_EXTRACT_PROMPT_IDENTITY = {
  promptId: STATE_EXTRACT_PROMPT_ID,
  version: 2,
  taskType: 'state_extract',
} as const satisfies PromptIdentity;

export const skeletonSpikePrompt = definePrompt<SkeletonPromptInput, SkeletonCandidateOutput>(
  SKELETON_SPIKE_PROMPT_IDENTITY,
  {
    inputSchema: SkeletonPromptInputSchema,
    outputSchema: SkeletonCandidateOutputSchema,
    supportedModes: ['structured'],
    build(input): PromptBundle {
      const validated = SkeletonPromptInputSchema.parse(input);
      return withPromptIdentity(SKELETON_SPIKE_PROMPT_IDENTITY, validated.constraintHash, {
        system:
          '这是协议验证用骨架Prompt。仅输出符合Schema的章节骨架，不输出整章正文或协议外说明。',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              targetLanguage: validated.targetLanguage,
              chapterGoal: validated.chapterGoal,
              requiredBeats: validated.requiredBeats,
              tendency: validated.tendency,
            }),
          },
        ],
        structuredOutput: { name: 'skeleton_candidate_v1', schema: SkeletonCandidateJsonSchema },
      });
    },
  },
);

export const chapterSpikePrompt = definePrompt<ChapterPromptInput, ChapterCandidateOutput>(
  CHAPTER_SPIKE_PROMPT_IDENTITY,
  {
    inputSchema: ChapterPromptInputSchema,
    outputSchema: ChapterCandidateOutputSchema,
    supportedModes: ['text', 'structured'],
    build(input): PromptBundle {
      const validated = ChapterPromptInputSchema.parse(input);
      const structuredOutput =
        validated.outputMode === 'structured'
          ? { name: 'chapter_candidate_v1', schema: ChapterCandidateJsonSchema }
          : undefined;
      return withPromptIdentity(CHAPTER_SPIKE_PROMPT_IDENTITY, validated.constraintHash, {
        system:
          validated.outputMode === 'text'
            ? '这是协议验证用章节Prompt。只输出正文，不输出寒暄、说明或“本章完”。'
            : '这是协议验证用章节Prompt。只输出符合Schema的正文块，不生成Draft Patch。',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              targetLanguage: validated.targetLanguage,
              chapterGoal: validated.chapterGoal,
              beats: validated.beats,
              targetCharacters: validated.targetCharacters,
            }),
          },
        ],
        ...(structuredOutput ? { structuredOutput } : {}),
      });
    },
  },
);

export const skeletonPrompt = definePrompt<
  ProductionSkeletonPromptInput,
  SkeletonCandidateBatchOutput
>(SKELETON_PROMPT_IDENTITY, {
  inputSchema: ProductionSkeletonPromptInputSchema,
  outputSchema: SkeletonCandidateBatchOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = ProductionSkeletonPromptInputSchema.parse(input);
    return withPromptIdentity(SKELETON_PROMPT_IDENTITY, validated.constraintHash, {
      system:
        '你是中文长篇小说结构编辑。只输出符合Schema的章节骨架；覆盖全部必选节拍，说明因果、后果、信息释放和人物意图；禁止输出正文或协议外说明。',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            targetLanguage: validated.targetLanguage,
            chapterGoal: validated.chapterGoal,
            requiredBeats: validated.requiredBeats,
            tendency: validated.tendency,
            candidateCount: validated.candidateCount,
            constraints: validated.constraintContext,
          }),
        },
      ],
      structuredOutput: {
        name: 'skeleton_candidate_batch_v1',
        schema: SkeletonCandidateBatchJsonSchema,
      },
    });
  },
});

export const chapterPrompt = definePrompt<ProductionChapterPromptInput, ChapterCandidateOutput>(
  CHAPTER_PROMPT_IDENTITY,
  {
    inputSchema: ProductionChapterPromptInputSchema,
    outputSchema: ChapterCandidateOutputSchema,
    supportedModes: ['text', 'structured'],
    build(input): PromptBundle {
      const validated = ProductionChapterPromptInputSchema.parse(input);
      return withPromptIdentity(CHAPTER_PROMPT_IDENTITY, validated.constraintHash, {
        system:
          validated.outputMode === 'text'
            ? '你是中文长篇小说正文作者。只输出正文，不输出寒暄、说明、Markdown围栏或“本章完”；遵守给定来源和约束，不修改已确认事实。'
            : '你是中文长篇小说正文作者。只输出符合Schema的正文块，不输出说明，不生成Draft Patch。',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              source: validated.source,
              targetLanguage: validated.targetLanguage,
              targetCharacters: validated.targetCharacters,
              styleInstructions: validated.styleInstructions,
              continuation: validated.continuation,
              constraints: validated.constraintContext,
            }),
          },
        ],
        ...(validated.outputMode === 'structured'
          ? {
              structuredOutput: {
                name: 'chapter_candidate_v1',
                schema: ChapterCandidateJsonSchema,
              },
            }
          : {}),
      });
    },
  },
);

export const rewritePrompt = definePrompt<RewritePromptInput, RewriteOutput>(
  REWRITE_PROMPT_IDENTITY,
  {
    inputSchema: RewritePromptInputSchema,
    outputSchema: RewriteOutputSchema,
    supportedModes: ['structured'],
    build(input): PromptBundle {
      const validated = RewritePromptInputSchema.parse(input);
      return withPromptIdentity(REWRITE_PROMPT_IDENTITY, validated.constraintHash, {
        system:
          '你是中文小说改写编辑。严格执行改写指令，保留专名、视角、时态和已确认事实，不新增未经请求的剧情事件；只输出符合Schema的替换文本。',
        messages: [{ role: 'user', content: JSON.stringify(validated) }],
        structuredOutput: { name: 'rewrite_candidate_v1', schema: RewriteOutputJsonSchema },
      });
    },
  },
);

export const mergePrompt = definePrompt<MergePromptInput, ChapterCandidateOutput>(
  MERGE_PROMPT_IDENTITY,
  {
    inputSchema: MergePromptInputSchema,
    outputSchema: ChapterCandidateOutputSchema,
    supportedModes: ['structured'],
    build(input): PromptBundle {
      const validated = MergePromptInputSchema.parse(input);
      return withPromptIdentity(MERGE_PROMPT_IDENTITY, validated.constraintHash, {
        system:
          '你是中文小说融合编辑。融合多个正文候选，保持事件顺序、指代和地点连续，只补必要过渡；禁止把结构骨架当作正文；只输出符合Schema的正文块。',
        messages: [{ role: 'user', content: JSON.stringify(validated) }],
        structuredOutput: { name: 'merge_candidate_v1', schema: ChapterCandidateJsonSchema },
      });
    },
  },
);

function validationPrompt(identity: PromptIdentity<'validate'>, system: string) {
  return definePrompt<SemanticValidationPromptInput, SemanticValidationOutput>(identity, {
    inputSchema: SemanticValidationPromptInputSchema,
    outputSchema: SemanticValidationOutputSchema,
    supportedModes: ['structured'],
    build(input): PromptBundle {
      const validated = SemanticValidationPromptInputSchema.parse(input);
      return withPromptIdentity(identity, validated.constraintHash, {
        system,
        messages: [{ role: 'user', content: JSON.stringify(validated) }],
        structuredOutput: {
          name: 'semantic_validation_v1',
          schema: SemanticValidationOutputJsonSchema,
        },
      });
    },
  });
}

export const validatePromptV1 = validationPrompt(
  VALIDATE_PROMPT_V1_IDENTITY,
  '你是小说连续性审阅员。只报告有正文或权威事实证据的问题，使用“可能”和“建议核对”等审慎措辞；无证据不得标为高风险；不修改正文或设定。',
);

export const validatePrompt = validationPrompt(
  VALIDATE_PROMPT_IDENTITY,
  '你是小说连续性审阅员。确定性规则已先行运行；你只补充无法机械判断的语义问题，包括人物行为或语言偏离已确认设定、使用尚未知情的信息、人物关系无过渡跳变、伏笔提前泄露、世界规则冲突和因果链缺环。每条必须同时引用正文或权威事实证据，使用“可能”和“建议核对”等审慎措辞；无证据不得标为高风险；不修改正文或设定。',
);

function extractionPrompt(identity: PromptIdentity<'state_extract'>, system: string) {
  return definePrompt<StateExtractionPromptInput, StateExtractionOutput>(identity, {
    inputSchema: StateExtractionPromptInputSchema,
    outputSchema: StateExtractionOutputSchema,
    supportedModes: ['structured'],
    build(input): PromptBundle {
      const validated = StateExtractionPromptInputSchema.parse(input);
      return withPromptIdentity(identity, validated.constraintHash, {
        system,
        messages: [{ role: 'user', content: JSON.stringify(validated) }],
        structuredOutput: {
          name: 'state_extraction_v1',
          schema: StateExtractionOutputJsonSchema,
        },
      });
    },
  });
}

export const stateExtractPromptV1 = extractionPrompt(
  STATE_EXTRACT_PROMPT_V1_IDENTITY,
  '你是小说状态提取器。只从给定Final Version提出EntityState或计划中弧光里程碑的候选变化；每条必须引用正文逻辑块证据；不得输出previousValue、直接修改权威状态或提出Canon写入。',
);

export const stateExtractPrompt = extractionPrompt(
  STATE_EXTRACT_PROMPT_IDENTITY,
  '你是小说设定整理员。只从给定Final Version提出人物与世界状态、知情变化、时间线事件与依赖、人物关系变化、伏笔进度、计划中的人物成长节点、新人物与世界条目或已存在条目的固定事实建议。每条必须引用正文逻辑块证据，并使用Schema中对应的严格proposalType结构；不得输出previousValue，不得直接修改任何权威状态。',
);

export const promptRegistry = [
  skeletonSpikePrompt,
  chapterSpikePrompt,
  skeletonPrompt,
  chapterPrompt,
  rewritePrompt,
  mergePrompt,
  validatePromptV1,
  validatePrompt,
  stateExtractPromptV1,
  stateExtractPrompt,
] as const;

type RegisteredPrompt = (typeof promptRegistry)[number];
const promptVersions = new Map<string, ReadonlyMap<number, RegisteredPrompt>>();

for (const definition of promptRegistry) {
  const existing = promptVersions.get(definition.promptId);
  const versions = new Map(existing ?? []);
  if (versions.has(definition.version)) {
    throw new Error(`Duplicate prompt registration: ${definition.promptId}@${definition.version}`);
  }
  versions.set(definition.version, definition);
  promptVersions.set(definition.promptId, versions);
}

export function getPromptDefinition(promptId: string, version: number): RegisteredPrompt {
  const versions = promptVersions.get(promptId);
  if (!versions) throw new RangeError(`Unknown prompt: ${promptId}@${version}`);
  const definition = versions.get(version);
  if (!definition) throw new RangeError(`Unknown prompt version: ${promptId}@${version}`);
  return definition;
}

export function listPromptVersions(promptId: string): readonly number[] {
  const versions = promptVersions.get(promptId);
  if (!versions) return [];
  return [...versions.keys()].sort((left, right) => left - right);
}
