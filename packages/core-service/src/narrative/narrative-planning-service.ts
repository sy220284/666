import { randomUUID } from 'node:crypto';

import {
  NarrativePlanningListInputSchema,
  type ArcMilestoneSaveInput,
  type ArcMilestoneTransitionInput,
  type CharacterArcSaveInput,
  type ForeshadowingSaveInput,
  type ForeshadowingTransitionInput,
  type NarrativePlanningCatalog,
  type NarrativePlanningListInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { CharacterArcOperations } from './character-arc-operations.js';
import { ForeshadowingOperations } from './foreshadowing-operations.js';
import { readCatalog } from './narrative-catalog.js';
import {
  systemClock,
  type NarrativePlanningServiceOptions,
} from './narrative-model.js';

export class NarrativePlanningService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #foreshadowing: ForeshadowingOperations;
  readonly #characterArcs: CharacterArcOperations;

  constructor(workspace: ProjectWorkspaceService, options: NarrativePlanningServiceOptions = {}) {
    const clock: DatabaseClock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    this.#workspace = workspace;
    this.#foreshadowing = new ForeshadowingOperations(workspace, clock, idFactory);
    this.#characterArcs = new CharacterArcOperations(workspace, clock, idFactory);
  }

  list(input: NarrativePlanningListInput): NarrativePlanningCatalog {
    const valid = NarrativePlanningListInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) =>
      readCatalog(connection, valid),
    );
  }

  async saveForeshadowing(
    requestId: string,
    input: ForeshadowingSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#foreshadowing.saveForeshadowing(requestId, input);
  }

  async transitionForeshadowing(
    requestId: string,
    input: ForeshadowingTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#foreshadowing.transitionForeshadowing(requestId, input);
  }

  async saveCharacterArc(
    requestId: string,
    input: CharacterArcSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#characterArcs.saveCharacterArc(requestId, input);
  }

  async saveArcMilestone(
    requestId: string,
    input: ArcMilestoneSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#characterArcs.saveArcMilestone(requestId, input);
  }

  async transitionArcMilestone(
    requestId: string,
    input: ArcMilestoneTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#characterArcs.transitionArcMilestone(requestId, input);
  }
}
