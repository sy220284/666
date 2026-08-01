import { useEffect, useState } from 'react';

import type { ProviderSummary, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { MergeMappingMode } from './generation-studio.js';

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
    void Promise.all([
      bridge.providers.list(),
      bridge.planning.listSceneBeats({ projectId, chapterId }),
    ]).then(([providerOutcome, beatOutcome]) => {
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId((current) => current || providerOutcome.data.providers[0]?.id || '');
      }
      if (beatOutcome.state === 'success') {
        setSceneBeats(beatOutcome.data.beats);
        setMergeMappingMode(beatOutcome.data.beats.length ? 'beat' : 'segment');
      }
    });
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
