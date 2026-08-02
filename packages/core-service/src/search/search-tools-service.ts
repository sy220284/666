import { randomUUID } from 'node:crypto';

import type {
  ProjectDictionaryDeleteInput,
  ProjectDictionaryListInput,
  ProjectDictionaryUpsertInput,
  ReplacePreviewInput,
  SearchProjectInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import type { RecoveryService } from '../recovery.js';
import { HardenedSearchIndexService } from '../search-index-hardening.js';
import { ReplaceApplyOperations } from './replace-apply.js';
import { ReplacePreviewOperations } from './replace-preview.js';
import { SearchDictionaryOperations } from './search-dictionary-operations.js';
import { SearchIndexOperations } from './search-index-operations.js';
import type { SearchToolsServiceOptions } from './search-model.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export class SearchToolsService {
  readonly #index: SearchIndexOperations;
  readonly #dictionary: SearchDictionaryOperations;
  readonly #preview: ReplacePreviewOperations;
  readonly #apply: ReplaceApplyOperations;

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    checkpointRequestId: (requestId: string) => string,
    options: SearchToolsServiceOptions = {},
  ) {
    const clock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    const search = new HardenedSearchIndexService(workspace, options.clock ? { clock } : {});
    this.#index = new SearchIndexOperations(search);
    this.#dictionary = new SearchDictionaryOperations(search);
    this.#preview = new ReplacePreviewOperations({ workspace, clock, idFactory });
    this.#apply = new ReplaceApplyOperations({
      workspace,
      recovery,
      clock,
      idFactory,
      checkpointRequestId,
    });
  }

  search(raw: SearchProjectInput) {
    return this.#index.search(raw);
  }

  getIndexState(projectId: string) {
    return this.#index.getState(projectId);
  }

  rebuildIndex(requestId: string, projectId: string) {
    return this.#index.rebuild(requestId, projectId);
  }

  listDictionary(raw: ProjectDictionaryListInput) {
    return this.#dictionary.list(raw);
  }

  upsertDictionary(requestId: string, raw: ProjectDictionaryUpsertInput) {
    return this.#dictionary.upsert(requestId, raw);
  }

  deleteDictionary(requestId: string, raw: ProjectDictionaryDeleteInput) {
    return this.#dictionary.delete(requestId, raw);
  }

  previewReplace(requestId: string, raw: ReplacePreviewInput) {
    return this.#preview.preview(requestId, raw);
  }

  applyReplace(requestId: string, raw: unknown) {
    return this.#apply.apply(requestId, raw);
  }
}
