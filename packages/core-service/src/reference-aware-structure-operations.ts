import type { ProjectWorkspaceService } from './project-workspace.js';
import { StructureOperationService } from './structure-operations.js';

/**
 * Compatibility name retained for existing dependency injection sites.
 * Permanent-delete preview, reference blocking and execution are owned by the
 * single StructureTrashOperationService composed by StructureOperationService.
 */
export class ReferenceAwareStructureOperationService extends StructureOperationService {
  constructor(workspace: ProjectWorkspaceService) {
    super(workspace);
  }
}
