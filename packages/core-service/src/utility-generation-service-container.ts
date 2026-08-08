import { CandidateService } from './candidate.js';
import { HardenedConstraintPackageService } from './constraint-package-hardening.js';
import { GenerationRunService } from './generation-run.js';
import { GenerationRuntime, type GenerationTaskProtocol } from './generation-runtime.js';
import { GenerationSourceResolver } from './generation-source-resolver.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { StateProposalService } from './state-proposal.js';
import type { UtilityGenerationServices } from './utility-generation-router.js';
import { ValidationService } from './validation.js';

export function createUtilityGenerationServiceContainer(
  projectWorkspace: ProjectWorkspaceService,
  taskProtocol: GenerationTaskProtocol,
) {
  const generationRuns = new GenerationRunService(projectWorkspace);
  const generationRuntime = new GenerationRuntime(generationRuns, taskProtocol);
  const candidates = new CandidateService(projectWorkspace);
  const stateProposals = new StateProposalService(projectWorkspace);
  const validation = new ValidationService(projectWorkspace);
  const generationServices: UtilityGenerationServices = {
    constraints: new HardenedConstraintPackageService(projectWorkspace),
    runs: generationRuns,
    runtime: generationRuntime,
    sources: new GenerationSourceResolver(projectWorkspace, candidates),
    stateProposals,
    validation,
  };

  return {
    generationRuns,
    generationRuntime,
    candidates,
    stateProposals,
    validation,
    generationServices,
  };
}

export type UtilityGenerationServiceContainer = ReturnType<
  typeof createUtilityGenerationServiceContainer
>;
