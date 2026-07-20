import {
  ContinuityListInputSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityStateInvalidateInput,
  type EntityStateSetInput,
  type KnowledgeStateInvalidateInput,
  type KnowledgeStateSetInput,
  type TimelineEventArchiveInput,
  type TimelineEventSaveInput,
} from '@worldforge/contracts';

import {
  createContinuityContext,
  type ContinuityContext,
  type ContinuityServiceOptions,
} from './continuity-model.js';
import { readCatalog } from './continuity-read.js';
import {
  invalidateEntityState,
  invalidateKnowledgeState,
  setEntityState,
  setKnowledgeState,
} from './continuity-state.js';
import { archiveTimelineEvent, saveTimelineEvent } from './continuity-timeline.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

export { ContinuityServiceError } from './continuity-model.js';
export type { ContinuityServiceErrorCode, ContinuityServiceOptions } from './continuity-model.js';

export class ContinuityService {
  readonly #context: ContinuityContext;

  constructor(workspace: ProjectWorkspaceService, options: ContinuityServiceOptions = {}) {
    this.#context = createContinuityContext(workspace, options);
  }

  list(input: ContinuityListInput): ContinuityCatalog {
    const valid = ContinuityListInputSchema.parse(input);
    return this.#context.workspace.readProject(valid.projectId, (connection) =>
      readCatalog(connection, valid),
    );
  }

  setEntityState(requestId: string, input: EntityStateSetInput): Promise<ContinuityCatalog> {
    return setEntityState(this.#context, requestId, input);
  }

  invalidateEntityState(
    requestId: string,
    input: EntityStateInvalidateInput,
  ): Promise<ContinuityCatalog> {
    return invalidateEntityState(this.#context, requestId, input);
  }

  saveTimelineEvent(requestId: string, input: TimelineEventSaveInput): Promise<ContinuityCatalog> {
    return saveTimelineEvent(this.#context, requestId, input);
  }

  archiveTimelineEvent(
    requestId: string,
    input: TimelineEventArchiveInput,
  ): Promise<ContinuityCatalog> {
    return archiveTimelineEvent(this.#context, requestId, input);
  }

  setKnowledgeState(requestId: string, input: KnowledgeStateSetInput): Promise<ContinuityCatalog> {
    return setKnowledgeState(this.#context, requestId, input);
  }

  invalidateKnowledgeState(
    requestId: string,
    input: KnowledgeStateInvalidateInput,
  ): Promise<ContinuityCatalog> {
    return invalidateKnowledgeState(this.#context, requestId, input);
  }
}
