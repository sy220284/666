import type { GenerationRunType } from '@worldforge/contracts';
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
});
