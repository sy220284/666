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
  const effectiveOptions = ideaReadOptions(operation, options);
  return coordinator.run(
    effectiveOptions.requestKey ?? ideaRequestKey(operation),
    async () =>
      (await window.worldforgeIdeaCapsule.operate(operation)) as CommandResult<IdeaOperationData>,
    effectiveOptions,
  );
}

export function cancelIdeaCapsuleRequests(): void {
  coordinator.cancelAll();
}

function ideaReadOptions(
  operation: CoreIdeaOperation,
  options: BridgeRequestOptions,
): BridgeRequestOptions {
  if (operation.operation === 'idea.list') {
    return {
      ...options,
      mode: 'replace',
      laneKey: `idea-list:${operation.input.projectId}`,
    };
  }
  if (operation.operation === 'idea.get') {
    return {
      ...options,
      mode: 'replace',
      laneKey: `idea-detail:${operation.input.projectId}`,
    };
  }
  return options;
}

function ideaRequestKey(operation: CoreIdeaOperation): string {
  switch (operation.operation) {
    case 'idea.list': {
      const input = operation.input;
      return [
        'idea.list',
        input.projectId,
        input.status ?? 'all',
        input.cursor?.updatedAt ?? 'first',
        input.cursor?.id ?? 'first',
        input.limit ?? 50,
      ].join(':');
    }
    case 'idea.get':
      return `idea.get:${operation.input.projectId}:${operation.input.ideaId}`;
    case 'idea.create':
      return `idea.create:${operation.input.projectId}:${operation.input.sourceContext.scopeType}:${operation.input.sourceContext.scopeId}`;
    case 'idea.setStatus':
      return `idea.setStatus:${operation.input.projectId}:${operation.input.ideaId}`;
    case 'idea.previewConversion':
      return `idea.previewConversion:${operation.input.projectId}:${operation.input.ideaId}`;
    case 'idea.applyConversion':
      return `idea.applyConversion:${operation.input.projectId}:${operation.input.ideaId}:${operation.input.previewHash}`;
  }
}
