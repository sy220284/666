import {
  ConstraintPackageBuildInputSchema,
  SearchProjectInputSchema,
  SearchProjectResultSchema,
  type ConstraintPackage,
  type ConstraintPackageBuildInput,
  type SearchProjectInput,
  type SearchProjectResult,
  type SearchResultItem,
} from '@worldforge/contracts';

import { applyConstraintAuthorityPolicy } from './constraint-package-authority.js';
import {
  ConstraintPackageService as BaseConstraintPackageService,
  type ConstraintPackageServiceOptions,
} from './constraint-package.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { HardenedSearchIndexService } from './search-index-hardening.js';

interface SupplementalContext {
  readonly projectId: string;
  readonly currentChapterId: string;
  readonly eligibleChapterIds: ReadonlySet<string>;
}

function deduplicate(items: readonly SearchResultItem[], limit: number): SearchResultItem[] {
  const seen = new Set<string>();
  const result: SearchResultItem[] = [];
  for (const item of items) {
    const key = `${item.sourceType}:${item.targetId}:${item.anchorId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

class ConstraintAwareSearchIndexService extends HardenedSearchIndexService {
  #context: SupplementalContext | null = null;

  runWithContext<T>(context: SupplementalContext, operation: () => T): T {
    if (this.#context) throw new Error('CONSTRAINT_SEARCH_CONTEXT_REENTRANT');
    this.#context = context;
    try {
      return operation();
    } finally {
      this.#context = null;
    }
  }

  override search(raw: SearchProjectInput): SearchProjectResult {
    const input = SearchProjectInputSchema.parse(raw);
    const context = this.#context;
    if (!context || context.projectId !== input.projectId) return super.search(input);

    const expandedLimit = Math.min(100, Math.max(input.limit * 8, input.limit + 32));
    const result = super.search({ ...input, limit: expandedLimit });
    const items = deduplicate(
      result.items.filter(
        (item) =>
          (item.chapterId === null || context.eligibleChapterIds.has(item.chapterId)) &&
          !(item.sourceType === 'draft' && item.chapterId === context.currentChapterId),
      ),
      input.limit,
    );
    return SearchProjectResultSchema.parse({ ...result, items });
  }
}

/**
 * Constraint package runtime that applies the authoritative chapter-time policy after the base
 * package is assembled. Supplemental recall is filtered before its caller limit, while the final
 * package removes Final-only current drafts, projects future narrative state, and restores archived
 * entities only when the target chapter still references them through SceneBeat authority.
 */
export class HardenedConstraintPackageService extends BaseConstraintPackageService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #contextualSearch: ConstraintAwareSearchIndexService | null;

  constructor(workspace: ProjectWorkspaceService, options: ConstraintPackageServiceOptions = {}) {
    const contextualSearch = options.searchIndex
      ? null
      : new ConstraintAwareSearchIndexService(workspace);
    super(workspace, {
      ...options,
      ...(contextualSearch ? { searchIndex: contextualSearch } : {}),
    });
    this.#workspace = workspace;
    this.#contextualSearch = contextualSearch;
  }

  override build(raw: ConstraintPackageBuildInput): ConstraintPackage {
    const input = ConstraintPackageBuildInputSchema.parse(raw);
    if (!this.#contextualSearch) {
      return applyConstraintAuthorityPolicy(this.#workspace, input, super.build(input));
    }

    const chapterIds = this.#workspace.readProject(input.projectId, (connection) =>
      connection
        .prepare(
          `SELECT chapter.id
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND chapter.deleted_at IS NULL
              AND volume.deleted_at IS NULL
            ORDER BY volume.order_key, chapter.order_key, chapter.id`,
        )
        .all(input.projectId)
        .map((row) => String(row.id)),
    );
    const chapterIndex = chapterIds.indexOf(input.chapterId);
    if (chapterIndex < 0) {
      return applyConstraintAuthorityPolicy(this.#workspace, input, super.build(input));
    }

    const packageValue = this.#contextualSearch.runWithContext(
      {
        projectId: input.projectId,
        currentChapterId: input.chapterId,
        eligibleChapterIds: new Set(chapterIds.slice(0, chapterIndex + 1)),
      },
      () => super.build(input),
    );
    return applyConstraintAuthorityPolicy(this.#workspace, input, packageValue);
  }
}
