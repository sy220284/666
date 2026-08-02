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
import { readNarrativePlanningCatalog } from './narrative-planning-catalog.js';
import { systemClock, type NarrativePlanningServiceOptions } from './narrative-planning-model.js';

export class NarrativePlanningService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #foreshadowing: ForeshadowingOperations;
  readonly #arcs: CharacterArcOperations;

  constructor(workspace: ProjectWorkspaceService, options: NarrativePlanningServiceOptions = {}) {
    const clock: DatabaseClock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    this.#workspace = workspace;
    this.#foreshadowing = new ForeshadowingOperations(workspace, clock, idFactory);
    this.#arcs = new CharacterArcOperations(workspace, clock, idFactory);
  }

  list(input: NarrativePlanningListInput): NarrativePlanningCatalog {
    const valid = NarrativePlanningListInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) =>
      readNarrativePlanningCatalog(connection, valid),
    );
  }

  async saveForeshadowing(
    requestId: string,
    input: ForeshadowingSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#foreshadowing.save(requestId, input);
  }

  async transitionForeshadowing(
    requestId: string,
    input: ForeshadowingTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#foreshadowing.transition(requestId, input);
  }

  async saveCharacterArc(
    requestId: string,
    input: CharacterArcSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#arcs.saveArc(requestId, input);
  }

  async saveArcMilestone(
    requestId: string,
    input: ArcMilestoneSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#arcs.saveMilestone(requestId, input);
  }

  async transitionArcMilestone(
    requestId: string,
    input: ArcMilestoneTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    return this.#arcs.transitionMilestone(requestId, input);
  }
}
