import {
  ChapterCandidateJsonSchema,
  ChapterCandidateOutputSchema,
  ChapterPromptInputSchema,
  SkeletonCandidateJsonSchema,
  SkeletonCandidateOutputSchema,
  SkeletonPromptInputSchema,
  type ChapterCandidateOutput,
  type ChapterPromptInput,
  type SkeletonCandidateOutput,
  type SkeletonPromptInput,
} from '@worldforge/contracts';

import type { PromptBundle, PromptDefinition } from './types.js';

export const SKELETON_SPIKE_PROMPT_ID = 'm0.spike.skeleton' as const;
export const CHAPTER_SPIKE_PROMPT_ID = 'm0.spike.chapter' as const;

function metadata(promptId: string, taskType: 'skeleton' | 'chapter', constraintHash: string) {
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

export function getPromptDefinition(
  promptId: typeof SKELETON_SPIKE_PROMPT_ID,
  version: 1,
): typeof skeletonSpikePrompt;
export function getPromptDefinition(
  promptId: typeof CHAPTER_SPIKE_PROMPT_ID,
  version: 1,
): typeof chapterSpikePrompt;
export function getPromptDefinition(
  promptId: string,
  version: number,
): typeof skeletonSpikePrompt | typeof chapterSpikePrompt;
export function getPromptDefinition(
  promptId: string,
  version: number,
): typeof skeletonSpikePrompt | typeof chapterSpikePrompt {
  if (version !== 1) throw new RangeError(`Unknown prompt version: ${promptId}@${version}`);
  if (promptId === SKELETON_SPIKE_PROMPT_ID) return skeletonSpikePrompt;
  if (promptId === CHAPTER_SPIKE_PROMPT_ID) return chapterSpikePrompt;
  throw new RangeError(`Unknown prompt: ${promptId}@${version}`);
}

export const promptRegistry = [skeletonSpikePrompt, chapterSpikePrompt] as const;
