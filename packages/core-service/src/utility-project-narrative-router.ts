import {
  NARRATIVE_PLANNING_COMMANDS,
  STATE_PROPOSAL_COMMANDS,
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import { NarrativePlanningService } from './narrative-planning.js';
import { StateProposalService } from './state-proposal.js';
import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

export async function routeNarrativePlanningOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  const narrativePlanning = new NarrativePlanningService(services.projectWorkspace);
  const stateProposal = new StateProposalService(services.projectWorkspace);
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- this router intentionally handles only narrative operations
  switch (operation.operation) {
    case NARRATIVE_PLANNING_COMMANDS.list:
      return success(operation.operation, narrativePlanning.list(operation.input));
    case NARRATIVE_PLANNING_COMMANDS.saveForeshadowing:
      return success(
        operation.operation,
        await narrativePlanning.saveForeshadowing(requestId, operation.input),
      );
    case NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing:
      return success(
        operation.operation,
        await narrativePlanning.transitionForeshadowing(requestId, operation.input),
      );
    case NARRATIVE_PLANNING_COMMANDS.saveCharacterArc:
      return success(
        operation.operation,
        await narrativePlanning.saveCharacterArc(requestId, operation.input),
      );
    case NARRATIVE_PLANNING_COMMANDS.saveArcMilestone:
      return success(
        operation.operation,
        await narrativePlanning.saveArcMilestone(requestId, operation.input),
      );
    case NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone:
      return success(
        operation.operation,
        await narrativePlanning.transitionArcMilestone(requestId, operation.input),
      );
    case STATE_PROPOSAL_COMMANDS.list:
      return success(operation.operation, stateProposal.list(operation.input));
    case STATE_PROPOSAL_COMMANDS.generate:
      return success(operation.operation, await stateProposal.generate(requestId, operation.input));
    case STATE_PROPOSAL_COMMANDS.resolve:
      return success(operation.operation, await stateProposal.resolve(requestId, operation.input));
    case STATE_PROPOSAL_COMMANDS.refreshSnapshot:
      return success(
        operation.operation,
        await stateProposal.refreshSnapshot(requestId, operation.input),
      );
    case STATE_PROPOSAL_COMMANDS.readSnapshot:
      return success(operation.operation, stateProposal.readSnapshot(operation.input));
    case STATE_PROPOSAL_COMMANDS.invalidateDerived:
      return success(
        operation.operation,
        await stateProposal.invalidateDerived(requestId, operation.input),
      );
    default:
      return null;
  }
}
