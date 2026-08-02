import {
  DraftBlockSchema,
  DraftDocumentSchema,
  DraftPatchOperationSchema,
  type DraftApplyPatchInput,
  type DraftDocument,
  type DraftPatchOperation,
} from '@worldforge/contracts';

import {
  DraftServiceError,
  draftContentHash,
  nonnegativeInteger,
  stable,
  type DraftRow,
  type PatchReplayRow,
} from './draft-model.js';

export function replayDocument(
  projectId: string,
  chapterId: string,
  draft: DraftRow,
  replay: PatchReplayRow,
  input: DraftApplyPatchInput,
): DraftDocument {
  let replayOperations: DraftPatchOperation[];
  try {
    replayOperations = DraftPatchOperationSchema.array()
      .max(150_000)
      .parse(JSON.parse(replay.operationsJson));
  } catch (error) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'The persisted Draft Patch operation log is invalid.',
      { cause: error },
    );
  }
  const replayBaseRevision = nonnegativeInteger(replay.baseRevision);
  const replayCommittedRevision = nonnegativeInteger(replay.committedRevision);
  if (
    replay.draftId !== draft.id ||
    replayBaseRevision !== input.baseRevision ||
    replayCommittedRevision !== replayBaseRevision + 1 ||
    stable(replayOperations) !== stable(input.operations)
  ) {
    throw new DraftServiceError(
      'DRAFT_PATCH_INVALID',
      'The requestId is already bound to a different Draft Patch.',
    );
  }
  try {
    const raw = JSON.parse(replay.afterBlocksJson) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) throw new TypeError('PATCH_REPLAY_BLOCKS_INVALID');
    const blocks = raw.map((item) => {
      if (!item || typeof item !== 'object') throw new TypeError('PATCH_REPLAY_BLOCK_INVALID');
      const block = item as Record<string, unknown>;
      const parsed = DraftBlockSchema.parse({
        logicalBlockId: block.logicalBlockId,
        clientBlockId: block.clientBlockId,
        orderKey: block.orderKey,
        blockType: block.blockType,
        text: block.text,
        attributes: block.attributes,
        source: block.source,
        locked: block.locked,
        contentHash: block.contentHash,
      });
      if (
        !parsed.contentHash ||
        draftContentHash({
          blockType: parsed.blockType,
          content: parsed.text,
          attributes: parsed.attributes,
        }) !== parsed.contentHash
      ) {
        throw new TypeError('PATCH_REPLAY_BLOCK_HASH_INVALID');
      }
      return parsed;
    });
    if (new Set(blocks.map((block) => block.logicalBlockId)).size !== blocks.length) {
      throw new TypeError('PATCH_REPLAY_BLOCK_IDS_DUPLICATE');
    }
    return DraftDocumentSchema.parse({
      projectId,
      chapterId,
      draftId: draft.id,
      status: draft.status,
      revision: replayCommittedRevision,
      blocks,
    });
  } catch (error) {
    if (error instanceof DraftServiceError) throw error;
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'The persisted Draft Patch replay result is invalid.',
      { cause: error },
    );
  }
}
