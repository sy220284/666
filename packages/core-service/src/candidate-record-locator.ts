import {
  CandidateUndoLookupInputSchema,
  CandidateUndoLookupSchema,
  type CandidateUndoLookup,
  type CandidateUndoLookupInput,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from './project-workspace.js';
import { CandidateApplyServiceError } from './candidate-state.js';

interface RecordIdRow {
  readonly applyRecordId: string;
}

export class CandidateRecordLocator {
  readonly #workspace: ProjectWorkspaceService;

  constructor(workspace: ProjectWorkspaceService) {
    this.#workspace = workspace;
  }

  find(raw: CandidateUndoLookupInput): CandidateUndoLookup {
    const input = CandidateUndoLookupInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const row = database
        .prepare(
          `SELECT ar.id AS applyRecordId
             FROM candidate_apply_records ar
             JOIN candidates ca ON ca.id = ar.candidate_id
             JOIN chapters ch ON ch.id = ca.chapter_id
             JOIN volumes vo ON vo.id = ch.volume_id
            WHERE ca.id = ? AND ch.id = ? AND vo.project_id = ?
            ORDER BY ar.applied_at DESC, ar.id DESC
            LIMIT 1`,
        )
        .get(input.candidateId, input.chapterId, input.projectId) as RecordIdRow | undefined;
      if (!row) {
        throw new CandidateApplyServiceError(
          'CANDIDATE_APPLY_NOT_FOUND',
          'No persisted Candidate record was found.',
        );
      }
      return CandidateUndoLookupSchema.parse(row);
    });
  }
}
