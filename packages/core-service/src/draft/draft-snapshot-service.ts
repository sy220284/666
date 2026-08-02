import { randomUUID } from 'node:crypto';

import {
  DraftSaveSnapshotInputSchema,
  type DraftDocument,
  type DraftSaveSnapshotInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  DraftServiceError,
  normalizeBlock,
  systemClock,
  type DraftServiceOptions,
} from './draft-model.js';
import { assertSnapshotPreservesLockedBlocks } from './draft-operation-policy.js';
import {
  activeChapter,
  activeDraft,
  readDocument,
  readWorkingBlocks,
} from './draft-record-reader.js';

export class DraftSnapshotService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: DraftServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  saveSnapshot(requestId: string, input: DraftSaveSnapshotInput): Promise<DraftDocument> {
    const valid = DraftSaveSnapshotInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const chapter = activeChapter(connection, valid.projectId, valid.chapterId);
      const draft = activeDraft(connection, valid.chapterId);
      if (!draft || chapter.activeDraftId !== draft.id || draft.id !== valid.draftId) {
        throw new DraftServiceError('DRAFT_NOT_FOUND', 'The requested active Draft was not found.');
      }
      const existingBlocks = readWorkingBlocks(connection, draft.id);
      assertSnapshotPreservesLockedBlocks(existingBlocks, valid.blocks);
      const existing = new Map(existingBlocks.map((block) => [block.logicalBlockId, block]));
      for (const block of valid.blocks) {
        if (block.logicalBlockId && !existing.has(block.logicalBlockId)) {
          throw new DraftServiceError(
            'DRAFT_BLOCK_NOT_FOUND',
            'A snapshot logicalBlockId does not belong to the active Draft.',
          );
        }
      }
      if (draft.revision >= Number.MAX_SAFE_INTEGER) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'The Draft revision exceeded the supported safe integer range.',
        );
      }
      const committedRevision = draft.revision + 1;
      connection.prepare('DELETE FROM draft_blocks WHERE draft_id = ?').run(draft.id);
      this.#faultInjector?.('after-block-delete');
      const insert = connection.prepare(
        `INSERT INTO draft_blocks(
           id, draft_id, logical_block_id, order_key, block_type, text, attributes_json,
           source, locked, content_hash, revision
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const [index, block] of valid.blocks.entries()) {
        const previous = block.logicalBlockId ? existing.get(block.logicalBlockId) : undefined;
        const normalized = normalizeBlock({
          blockType: block.blockType,
          content: block.text,
          attributes: block.attributes,
        });
        insert.run(
          previous?.recordId ?? this.#idFactory(),
          draft.id,
          previous?.logicalBlockId ?? this.#idFactory(),
          BigInt(index + 1) * 1024n,
          normalized.blockType,
          normalized.text,
          JSON.stringify(normalized.attributes),
          previous?.source ?? 'manual',
          previous?.locked ? 1 : 0,
          normalized.contentHash,
          committedRevision,
        );
      }
      connection
        .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ?')
        .run(committedRevision, this.#clock.now().toISOString(), draft.id);
      return readDocument(connection, valid.projectId, valid.chapterId, {
        ...draft,
        revision: committedRevision,
      });
    });
  }
}
