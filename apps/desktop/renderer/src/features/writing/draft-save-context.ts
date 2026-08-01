import type { DraftSnapshotEditorBlock, Editor } from '@worldforge/editor-core';

export interface DraftSaveContext {
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly baseRevision: number;
  readonly editor: Editor;
  readonly editorGeneration: number;
  readonly documentFingerprint: string;
  readonly blockIdentityMap: ReadonlyMap<string, string | null>;
  readonly requestSnapshot: readonly DraftSnapshotEditorBlock[];
  readonly requestedAt: number;
}

interface DraftSaveContextInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly baseRevision: number;
  readonly editor: Editor;
  readonly editorGeneration: number;
  readonly documentFingerprint: string;
  readonly requestSnapshot: readonly DraftSnapshotEditorBlock[];
  readonly requestedAt?: number;
}

export function createDraftSaveContext(input: DraftSaveContextInput): DraftSaveContext {
  return Object.freeze({
    ...input,
    blockIdentityMap: new Map(
      input.requestSnapshot.map((block) => [block.clientBlockId, block.logicalBlockId]),
    ),
    requestedAt: input.requestedAt ?? Date.now(),
  });
}

export function draftSaveContextIsCurrent(
  context: DraftSaveContext,
  current: {
    readonly chapterId: string | null;
    readonly draftId: string | null;
    readonly editor: Editor | null;
    readonly editorGeneration: number;
  },
): boolean {
  return (
    current.chapterId === context.chapterId &&
    current.draftId === context.draftId &&
    current.editor === context.editor &&
    current.editorGeneration === context.editorGeneration
  );
}
