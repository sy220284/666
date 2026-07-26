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
  type PromptTaskType,
  type RewriteOutput,
  type RewritePromptInput,
  type SemanticValidationOutput,
  type SemanticValidationPromptInput,
  type SkeletonCandidateOutput,
  type SkeletonPromptInput,
  type StateExtractionOutput,
  type StateExtractionPromptInput,
} from '@worldforge/contracts';

import type { PromptBundle, PromptDefinition } from './types.js';

export const SKELETON_SPIKE_PROMPT_ID = 'm0.spike.skeleton' as const;
export const CHAPTER_SPIKE_PROMPT_ID = 'm0.spike.chapter' as const;
export const SKELETON_PROMPT_ID = 'worldforge.skeleton' as const;
export const CHAPTER_PROMPT_ID = 'worldforge.chapter' as const;
export const REWRITE_PROMPT_ID = 'worldforge.rewrite' as const;
export const MERGE_PROMPT_ID = 'worldforge.merge' as const;
export const VALIDATE_PROMPT_ID = 'worldforge.validate' as const;
export const STATE_EXTRACT_PROMPT_ID = 'worldforge.state-extract' as const;

function metadata(promptId: string, taskType: PromptTaskType, constraintHash: string) {
  return { promptId, promptVersion: 1, taskType, constraintHash } as const;
}

export const skeletonSpikePrompt: PromptDefinition<SkeletonPromptInput, SkeletonCandidateOutput> = {
  promptId: SKELETON_SPIKE_PROMPT_ID,
  version: 1,
  taskType: 'skeleton',
  inputSchema: SkeletonPromptInputSchema,
  outputSchema: SkeletonCandidateOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = SkeletonPromptInputSchema.parse(input);
    return {
      system: '这是协议验证用骨架Prompt。仅输出符合Schema的章节骨架，不输出整章正文或协议外说明。',
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
      metadata: metadata(SKELETON_SPIKE_PROMPT_ID, 'skeleton', validated.constraintHash),
    };
  },
};

export const chapterSpikePrompt: PromptDefinition<ChapterPromptInput, ChapterCandidateOutput> = {
  promptId: CHAPTER_SPIKE_PROMPT_ID,
  version: 1,
  taskType: 'chapter',
  inputSchema: ChapterPromptInputSchema,
  outputSchema: ChapterCandidateOutputSchema,
  supportedModes: ['text', 'structured'],
  build(input): PromptBundle {
    const validated = ChapterPromptInputSchema.parse(input);
    const structuredOutput =
      validated.outputMode === 'structured'
        ? { name: 'chapter_candidate_v1', schema: ChapterCandidateJsonSchema }
        : undefined;
    return {
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
      metadata: metadata(CHAPTER_SPIKE_PROMPT_ID, 'chapter', validated.constraintHash),
    };
  },
};

export const skeletonPrompt: PromptDefinition<
  ProductionSkeletonPromptInput,
  SkeletonCandidateOutput
> = {
  promptId: SKELETON_PROMPT_ID,
  version: 1,
  taskType: 'skeleton',
  inputSchema: ProductionSkeletonPromptInputSchema,
  outputSchema: SkeletonCandidateOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = ProductionSkeletonPromptInputSchema.parse(input);
    return {
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
            constraints: validated.constraintContext,
          }),
        },
      ],
      structuredOutput: { name: 'skeleton_candidate_v1', schema: SkeletonCandidateJsonSchema },
      metadata: metadata(SKELETON_PROMPT_ID, 'skeleton', validated.constraintHash),
    };
  },
};

export const chapterPrompt: PromptDefinition<ProductionChapterPromptInput, ChapterCandidateOutput> =
  {
    promptId: CHAPTER_PROMPT_ID,
    version: 1,
    taskType: 'chapter',
    inputSchema: ProductionChapterPromptInputSchema,
    outputSchema: ChapterCandidateOutputSchema,
    supportedModes: ['text', 'structured'],
    build(input): PromptBundle {
      const validated = ProductionChapterPromptInputSchema.parse(input);
      return {
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
        metadata: metadata(CHAPTER_PROMPT_ID, 'chapter', validated.constraintHash),
      };
    },
  };

export const rewritePrompt: PromptDefinition<RewritePromptInput, RewriteOutput> = {
  promptId: REWRITE_PROMPT_ID,
  version: 1,
  taskType: 'rewrite',
  inputSchema: RewritePromptInputSchema,
  outputSchema: RewriteOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = RewritePromptInputSchema.parse(input);
    return {
      system:
        '你是中文小说改写编辑。严格执行改写指令，保留专名、视角、时态和已确认事实，不新增未经请求的剧情事件；只输出符合Schema的替换文本。',
      messages: [{ role: 'user', content: JSON.stringify(validated) }],
      structuredOutput: { name: 'rewrite_candidate_v1', schema: RewriteOutputJsonSchema },
      metadata: metadata(REWRITE_PROMPT_ID, 'rewrite', validated.constraintHash),
    };
  },
};

export const mergePrompt: PromptDefinition<MergePromptInput, ChapterCandidateOutput> = {
  promptId: MERGE_PROMPT_ID,
  version: 1,
  taskType: 'merge',
  inputSchema: MergePromptInputSchema,
  outputSchema: ChapterCandidateOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = MergePromptInputSchema.parse(input);
    return {
      system:
        '你是中文小说融合编辑。融合多个正文候选，保持事件顺序、指代和地点连续，只补必要过渡；禁止把结构骨架当作正文；只输出符合Schema的正文块。',
      messages: [{ role: 'user', content: JSON.stringify(validated) }],
      structuredOutput: { name: 'merge_candidate_v1', schema: ChapterCandidateJsonSchema },
      metadata: metadata(MERGE_PROMPT_ID, 'merge', validated.constraintHash),
    };
  },
};

export const validatePrompt: PromptDefinition<
  SemanticValidationPromptInput,
  SemanticValidationOutput
> = {
  promptId: VALIDATE_PROMPT_ID,
  version: 1,
  taskType: 'validate',
  inputSchema: SemanticValidationPromptInputSchema,
  outputSchema: SemanticValidationOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = SemanticValidationPromptInputSchema.parse(input);
    return {
      system:
        '你是小说连续性审阅员。只报告有正文或权威事实证据的问题，使用“可能”和“建议核对”等审慎措辞；无证据不得标为高风险；不修改正文或设定。',
      messages: [{ role: 'user', content: JSON.stringify(validated) }],
      structuredOutput: {
        name: 'semantic_validation_v1',
        schema: SemanticValidationOutputJsonSchema,
      },
      metadata: metadata(VALIDATE_PROMPT_ID, 'validate', validated.constraintHash),
    };
  },
};

export const stateExtractPrompt: PromptDefinition<
  StateExtractionPromptInput,
  StateExtractionOutput
> = {
  promptId: STATE_EXTRACT_PROMPT_ID,
  version: 1,
  taskType: 'state_extract',
  inputSchema: StateExtractionPromptInputSchema,
  outputSchema: StateExtractionOutputSchema,
  supportedModes: ['structured'],
  build(input): PromptBundle {
    const validated = StateExtractionPromptInputSchema.parse(input);
    return {
      system:
        '你是小说状态提取器。只从给定Final Version提出EntityState或计划中弧光里程碑的候选变化；每条必须引用正文逻辑块证据；不得输出previousValue、直接修改权威状态或提出Canon写入。',
      messages: [{ role: 'user', content: JSON.stringify(validated) }],
      structuredOutput: {
        name: 'state_extraction_v1',
        schema: StateExtractionOutputJsonSchema,
      },
      metadata: metadata(STATE_EXTRACT_PROMPT_ID, 'state_extract', validated.constraintHash),
    };
  },
};

export function getPromptDefinition(
  promptId: string,
  version: number,
):
  | typeof skeletonSpikePrompt
  | typeof chapterSpikePrompt
  | typeof skeletonPrompt
  | typeof chapterPrompt
  | typeof rewritePrompt
  | typeof mergePrompt
  | typeof validatePrompt
  | typeof stateExtractPrompt {
  if (version !== 1) throw new RangeError(`Unknown prompt version: ${promptId}@${version}`);
  if (promptId === SKELETON_SPIKE_PROMPT_ID) return skeletonSpikePrompt;
  if (promptId === CHAPTER_SPIKE_PROMPT_ID) return chapterSpikePrompt;
  if (promptId === SKELETON_PROMPT_ID) return skeletonPrompt;
  if (promptId === CHAPTER_PROMPT_ID) return chapterPrompt;
  if (promptId === REWRITE_PROMPT_ID) return rewritePrompt;
  if (promptId === MERGE_PROMPT_ID) return mergePrompt;
  if (promptId === VALIDATE_PROMPT_ID) return validatePrompt;
  if (promptId === STATE_EXTRACT_PROMPT_ID) return stateExtractPrompt;
  throw new RangeError(`Unknown prompt: ${promptId}@${version}`);
}

export const promptRegistry = [
  skeletonSpikePrompt,
  chapterSpikePrompt,
  skeletonPrompt,
  chapterPrompt,
  rewritePrompt,
  mergePrompt,
  validatePrompt,
  stateExtractPrompt,
] as const;
