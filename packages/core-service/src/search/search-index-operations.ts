import type { SearchProjectInput } from '@worldforge/contracts';

import { HardenedSearchIndexService } from '../search-index-hardening.js';

export class SearchIndexOperations {
  readonly #search: HardenedSearchIndexService;

  constructor(search: HardenedSearchIndexService) {
    this.#search = search;
  }

  search(raw: SearchProjectInput) {
    return this.#search.search(raw);
  }

  getState(projectId: string) {
    return this.#search.getState(projectId);
  }

  rebuild(requestId: string, projectId: string) {
    return this.#search.rebuild(requestId, projectId);
  }
}
