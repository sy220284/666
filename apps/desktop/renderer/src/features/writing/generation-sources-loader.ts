import type { ProviderSummary, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export interface GenerationSourcesLoadResult {
  readonly providers: readonly ProviderSummary[] | null;
  readonly sceneBeats: readonly SceneBeat[] | null;
}

export async function loadGenerationSources(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string,
  signal: AbortSignal,
): Promise<GenerationSourcesLoadResult> {
  const [providerRequest, beatRequest] = await Promise.allSettled([
    bridge.providers.list({ mode: 'share', signal }),
    bridge.planning.listSceneBeats({ projectId, chapterId }, { mode: 'share', signal }),
  ]);
  if (signal.aborted) return { providers: null, sceneBeats: null };
  const providerOutcome = providerRequest.status === 'fulfilled' ? providerRequest.value : null;
  const beatOutcome = beatRequest.status === 'fulfilled' ? beatRequest.value : null;
  return {
    providers: providerOutcome?.state === 'success' ? providerOutcome.data.providers : null,
    sceneBeats: beatOutcome?.state === 'success' ? beatOutcome.data.beats : null,
  };
}
