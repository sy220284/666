import { useEffect, useState } from 'react';

import type { ProviderSummary, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { MergeMappingMode } from './generation-studio.js';
import { loadGenerationSources } from './generation-sources-loader.js';

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
      const nextProviders = result.providers;
      if (nextProviders) {
        setProviders(nextProviders);
        setProviderId((current) =>
          nextProviders.some((provider) => provider.id === current) ? current : '',
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
