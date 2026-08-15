import { IdeaConversionTargetSchema, type GenerationRunType } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { GenerationWorkflowHandlers } from '../../packages/core-service/src/utility-generation-router.js';
import {
  IDEA_EXPLORE_PROMPT_IDENTITY,
  ideaExplorePrompt,
} from '../../packages/prompts/src/registry.js';

const exhaustiveHandlers: Record<GenerationRunType, unknown> = GenerationWorkflowHandlers;

describe('M11-05 Generation workflow handler authority', () => {
  it('keeps every GenerationRunType in the single exhaustive handler map', () => {
    expect(Object.keys(exhaustiveHandlers).sort()).toEqual(
      [
        'chapter',
        'idea_explore',
        'journal_summarize',
        'merge',
        'rewrite',
        'skeleton',
        'state_extract',
        'validate',
      ].sort(),
    );
  });

  it('binds idea_explore to the exact registered prompt identity and structured output mode', () => {
    expect(ideaExplorePrompt.identity).toEqual(IDEA_EXPLORE_PROMPT_IDENTITY);
    expect(ideaExplorePrompt).toMatchObject({
      promptId: 'worldforge.idea-explore',
      version: 1,
      taskType: 'idea_explore',
      supportedModes: ['structured'],
    });
  });

  it('preserves Foreshadowing relation and chapter-link uniqueness in conversion drafts', () => {
    const chapterId = '00000000-0000-4000-8000-000000000501';
    const targetForeshadowingId = '00000000-0000-4000-8000-000000000502';
    const result = IdeaConversionTargetSchema.safeParse({
      targetType: 'foreshadowing',
      draft: {
        title: '重复约束回归',
        description: '',
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [
          { chapterId, role: 'plant' },
          { chapterId, role: 'plant' },
        ],
        relations: [
          { targetForeshadowingId, kind: 'depends_on' },
          { targetForeshadowingId, kind: 'depends_on' },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['draft', 'relations'],
            message: 'Relations must be unique.',
          }),
          expect.objectContaining({
            path: ['draft', 'chapterLinks'],
            message: 'Chapter links must be unique.',
          }),
        ]),
      );
    }
  });
});
