import {
  type DraftApplyPatchInput,
  type DraftDocument,
  type DraftOpenInput,
  type DraftSaveSnapshotInput,
  type MutationOrigin,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import type { DraftServiceOptions } from './draft-model.js';
import { DraftOpenService } from './draft-open-service.js';
import { DraftPatchService } from './draft-patch-service.js';
import { DraftSnapshotService } from './draft-snapshot-service.js';

export class DraftService {
  readonly #openService: DraftOpenService;
  readonly #snapshotService: DraftSnapshotService;
  readonly #patchService: DraftPatchService;

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#openService = new DraftOpenService(workspace, options);
    this.#snapshotService = new DraftSnapshotService(workspace, options);
    this.#patchService = new DraftPatchService(workspace, options);
  }

  open(requestId: string, input: DraftOpenInput): Promise<DraftDocument> {
    return this.#openService.open(requestId, input);
  }

  saveSnapshot(requestId: string, input: DraftSaveSnapshotInput): Promise<DraftDocument> {
    return this.#snapshotService.saveSnapshot(requestId, input);
  }

  applyPatch(requestId: string, input: DraftApplyPatchInput): Promise<DraftDocument> {
    return this.applyPatchWithOrigin(requestId, input, 'manual_edit');
  }

  applyPatchWithOrigin(
    requestId: string,
    input: DraftApplyPatchInput,
    mutationOrigin: MutationOrigin,
  ): Promise<DraftDocument> {
    return this.#patchService.applyPatchWithOrigin(requestId, input, mutationOrigin);
  }
}
