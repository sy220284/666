import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { GenerationSourceResolver } from '../../packages/core-service/src/generation-source-resolver.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import {
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

afterEach(cleanupCandidateApplyDirectories);

describe('GenerationSourceResolver final Version regression', () => {
  it('resolves the current Final Version from persisted version blocks in stable order', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);
      const versions = new VersionService(harness.workspace);

      const version = await versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '最终来源回归',
      });

      expect(() =>
        resolver.resolveFinalVersion(project.projectId, chapter.id, version.versionId),
      ).toThrow();

      await versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: version.versionId,
      });

      const resolved = resolver.resolveFinalVersion(
        project.projectId,
        chapter.id,
        version.versionId,
      );

      expect(resolved.versionId).toBe(version.versionId);
      expect(resolved.blocks.map((block) => block.logicalBlockId)).toEqual(
        draft.blocks.map((block) => block.logicalBlockId),
      );
      expect(resolved.inputSources).toEqual([
        expect.objectContaining({
          sourceType: 'version',
          sourceId: version.versionId,
          metadata: { final: true, blockCount: 2 },
        }),
      ]);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
