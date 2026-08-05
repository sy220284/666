import { useEffect, useState } from 'react';

import type { ProviderSummary, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { MergeMappingMode } from './generation-studio.js';

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

export function useGenerationSources(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string,
) {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [sceneBeats, setSceneBeats] = useState<readonly SceneBeat[]>([]);
  const [mergeMappingMode, setMergeMappingMode] = useState<MergeMappingMode>('segment');

  useEffect(() => {
    const controller = new AbortController();
    setSceneBeats([]);
    setMergeMappingMode('segment');
    void loadGenerationSources(bridge, projectId, chapterId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.providers) {
        setProviders(result.providers);
        setProviderId((current) =>
          result.providers!.some((provider) => provider.id === current)
            ? current
            : result.providers![0]?.id || '',
        );
      }
      if (result.sceneBeats) {
        setSceneBeats(result.sceneBeats);
        setMergeMappingMode(result.sceneBeats.length ? 'beat' : 'segment');
      }
    });
    return () => controller.abort();
  }, [bridge, chapterId, projectId]);

  return {
    providers,
    providerId,
    setProviderId,
    sceneBeats,
    mergeMappingMode,
    setMergeMappingMode,
  };
}
