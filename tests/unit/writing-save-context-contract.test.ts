import { describe, expect, it } from 'vitest';

import {
  createDraftSaveContext,
  draftSaveContextIsCurrent,
} from '../../apps/desktop/renderer/src/features/writing/draft-save-context.js';

describe('writing save request contract', () => {
  it('carries an immutable request context into metadata synchronization', () => {
    const editor = {} as Parameters<typeof createDraftSaveContext>[0]['editor'];
    const context = createDraftSaveContext({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      draftId: 'draft-1',
      baseRevision: 3,
      editor,
      editorGeneration: 7,
      documentFingerprint: '{"type":"doc"}',
      requestSnapshot: [
        {
          clientBlockId: 'client-1',
          logicalBlockId: 'logical-1',
          blockType: 'paragraph',
          text: '正文',
          attributes: {},
        },
      ],
      requestedAt: 42,
    });

    expect(Object.isFrozen(context)).toBe(true);
    expect(context.blockIdentityMap.get('client-1')).toBe('logical-1');
    expect(
      draftSaveContextIsCurrent(context, {
        chapterId: 'chapter-1',
        draftId: 'draft-1',
        editor,
        editorGeneration: 7,
      }),
    ).toBe(true);
    expect(
      draftSaveContextIsCurrent(context, {
        chapterId: 'chapter-2',
        draftId: 'draft-1',
        editor,
        editorGeneration: 7,
      }),
    ).toBe(false);
  });
});
