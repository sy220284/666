import { randomUUID } from 'node:crypto';

import {
  DraftOpenInputSchema,
  type DraftDocument,
  type DraftOpenInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  DraftServiceError,
  systemClock,
  type DraftServiceOptions,
} from './draft-model.js';
import {
  ensureStoredHashes,
  hasMissingHashes,
  readDocument,
  readExistingDraft,
} from './draft-record-reader.js';
import { initializeChapterDraft } from './draft-record-writer.js';

export class DraftOpenService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async open(requestId: string, input: DraftOpenInput): Promise<DraftDocument> {
    const valid = DraftOpenInputSchema.parse(input);
    const existing = this.#workspace.readProject(valid.projectId, (connection) => {
      const draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      return draft
        ? {
            draft,
            document: readDocument(connection, valid.projectId, valid.chapterId, draft),
            missing: hasMissingHashes(connection, draft.id),
          }
        : null;
    });
    if (existing) {
      const project = this.#workspace.assertActiveProject(valid.projectId);
      if (!existing.missing || project.databaseMode === 'read-only') return existing.document;
    }
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      let draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      if (!draft) {
        const timestamp = this.#clock.now().toISOString();
        initializeChapterDraft(connection, valid.chapterId, timestamp, this.#idFactory);
        draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      }
      if (!draft) {
        throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'The active Draft was not created.');
      }
      ensureStoredHashes(connection, draft.id);
      return readDocument(connection, valid.projectId, valid.chapterId, draft);
    });
  }
}
