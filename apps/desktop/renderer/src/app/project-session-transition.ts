import type {
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';

export type ProjectSessionTransition =
  | {
      readonly state: 'ready';
      readonly project: ProjectWorkspaceSummary | null;
      readonly continuation: ProjectContinuationSnapshot | null;
    }
  | {
      readonly state: 'stale';
    };

export async function prepareProjectSessionTransition({
  bridge,
  project,
  isCurrent,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary | null;
  readonly isCurrent: () => boolean;
}): Promise<ProjectSessionTransition> {
  let continuation: ProjectContinuationSnapshot | null = null;
  if (project) {
    const outcome = await bridge.project.getContinuation(project.projectId, {
      mode: 'replace',
    });
    if (!isCurrent()) return { state: 'stale' };
    if (outcome.state === 'success') continuation = outcome.data;
  }
  return isCurrent()
    ? { state: 'ready', project, continuation }
    : { state: 'stale' };
}
