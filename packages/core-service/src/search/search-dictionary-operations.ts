import type {
  ProjectDictionaryDeleteInput,
  ProjectDictionaryListInput,
  ProjectDictionaryUpsertInput,
} from '@worldforge/contracts';

import type { HardenedSearchIndexService } from '../search-index-hardening.js';

export class SearchDictionaryOperations {
  readonly #search: HardenedSearchIndexService;

  constructor(search: HardenedSearchIndexService) {
    this.#search = search;
  }

  list(raw: ProjectDictionaryListInput) {
    return this.#search.listDictionary(raw);
  }

  upsert(requestId: string, raw: ProjectDictionaryUpsertInput) {
    return this.#search.upsertDictionary(requestId, raw);
  }

  delete(requestId: string, raw: ProjectDictionaryDeleteInput) {
    return this.#search.deleteDictionary(requestId, raw);
  }
}
