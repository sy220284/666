import type { CommandResult, CoreIdeaOperation, IdeaOperationData } from '@worldforge/contracts';

import {
  BridgeRequestCoordinator,
  type BridgeRequestOptions,
  type BridgeRequestOutcome,
} from './request-lifecycle.js';

const coordinator = new BridgeRequestCoordinator();

export function runIdeaCapsuleOperation(
  operation: CoreIdeaOperation,
  options: BridgeRequestOptions = {},
): Promise<BridgeRequestOutcome<IdeaOperationData>> {
  return coordinator.run(
    options.requestKey ?? ideaRequestKey(operation),
    async () =>
      (await window.worldforgeIdeaCapsule.operate(operation)) as CommandResult<IdeaOperationData>,
    options,
  );
}

export function cancelIdeaCapsuleRequests(): void {
  coordinator.cancelAll();
}

function ideaRequestKey(operation: CoreIdeaOperation): string {
  const input = operation.input;
  switch (operation.operation) {
    case 'idea.list':
      return [
        'idea.list',
        input.projectId,
        input.status ?? 'all',
        input.cursor?.updatedAt ?? 'first',
        input.cursor?.id ?? 'first',
        input.limit ?? 50,
      ].join(':');
    case 'idea.get':
      return `idea.get:${input.projectId}:${input.ideaId}`;
    case 'idea.create':
      return `idea.create:${input.projectId}:${input.sourceContext.scopeType}:${input.sourceContext.scopeId}`;
    case 'idea.setStatus':
      return `idea.setStatus:${input.projectId}:${input.ideaId}`;
    case 'idea.previewConversion':
      return `idea.previewConversion:${input.projectId}:${input.ideaId}`;
    case 'idea.applyConversion':
      return `idea.applyConversion:${input.projectId}:${input.ideaId}:${input.previewHash}`;
  }
}
