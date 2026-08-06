import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('M4-04 C3 generation workbench', () => {
  it('exposes the complete author-controlled generation and Candidate workflow', async () => {
    const source = await readGenerationWorkbenchSources();

    for (const marker of [
      'data-generation-studio',
      'data-generation-mode',
      'data-generation-provider',
      'data-start-generation',
      'data-cancel-generation',
      'data-save-partial-candidate',
      'data-discard-partial-candidate',
      'data-continue-partial-candidate',
      'data-skeleton-review',
      'data-save-skeleton-revision',
      'data-merge-candidate-picker',
      'data-merge-mapping-mode',
      'data-retry-rewrite',
      'data-selected-candidate-provenance',
    ]) {
      expect(source).toContain(marker);
    }

    expect(source).toContain("generationMode === 'skeleton'");
    expect(source).toContain("generationMode === 'chapter'");
    expect(source).toContain("generationMode === 'rewrite'");
    expect(source).toContain("generationMode === 'merge'");
    expect(source).toContain('getRewriteSelectionAnchor');
    expect(source).toContain('acknowledgeStaleSkeleton');
    expect(source).toContain("mappingType: 'beat'");
    expect(source).toContain("mappingType: 'segment'");
    expect(source).toContain('lastGenerationIntent');
    expect(source).toContain('candidate.editSkeleton');
    expect(source).toContain('generation.savePartial');
    expect(source).toContain('generation.discardPartial');
    expect(source).toContain('情节骨架不会直接进入正文差异、采用、历史版本或定稿');
  });

  it('shows persisted task stages and never renders a fabricated AI percentage', async () => {
    const source = await readGenerationWorkbenchSources();

    expect(source).toContain("update.event.type === 'ai.stage'");
    expect(source).toContain("update.event.type === 'ai.delta'");
    expect(source).toContain('bridge.generation.getRun');
    expect(source).not.toMatch(/AI[^'\n]{0,32}\d+%/u);
  });
});

async function readGenerationWorkbenchSources(): Promise<string> {
  const root = path.join(process.cwd(), 'apps/desktop/renderer/src/features/writing');
  return Promise.all(
    [
      'writing-core-workbench.tsx',
      'candidate-generation-refresh.ts',
      'candidate-review-panel.tsx',
      'candidate-preview-actions.ts',
      'candidate-review-display.tsx',
      'candidate-skeleton-review.tsx',
      'generation-studio.tsx',
      'generation-start.ts',
      'generation-task-subscription.ts',
      'use-generation-run-actions.ts',
    ].map((file) => readFile(path.join(root, file), 'utf8')),
  ).then((sources) => sources.join('\n'));
}
