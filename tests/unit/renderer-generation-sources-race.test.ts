import { describe, expect, it } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { loadGenerationSources } from '../../apps/desktop/renderer/src/features/writing/use-generation-sources.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function bridgeWith(
  providers: () => Promise<unknown>,
  beats: () => Promise<unknown>,
): RendererBridgeAdapter {
  return {
    providers: { list: providers },
    planning: { listSceneBeats: beats },
  } as unknown as RendererBridgeAdapter;
}

describe('M10-11 generation source request lifecycle', () => {
  it('does not expose results from a chapter request after its signal is aborted', async () => {
    const providerRequest = deferred<unknown>();
    const beatRequest = deferred<unknown>();
    const controller = new AbortController();
    const loading = loadGenerationSources(
      bridgeWith(() => providerRequest.promise, () => beatRequest.promise),
      'project-a',
      'chapter-old',
      controller.signal,
    );

    controller.abort();
    providerRequest.resolve({
      state: 'success',
      data: { providers: [{ id: 'provider-old' }] },
    });
    beatRequest.resolve({
      state: 'success',
      data: { beats: [{ id: 'beat-old' }] },
    });

    await expect(loading).resolves.toEqual({ providers: null, sceneBeats: null });
  });

  it('preserves a successful SceneBeat result when the Provider list fails independently', async () => {
    const bridge = bridgeWith(
      () => Promise.reject(new Error('provider unavailable')),
      () =>
        Promise.resolve({
          state: 'success',
          data: { beats: [{ id: 'beat-current' }] },
        }),
    );

    const result = await loadGenerationSources(
      bridge,
      'project-a',
      'chapter-current',
      new AbortController().signal,
    );

    expect(result.providers).toBeNull();
    expect(result.sceneBeats).toEqual([{ id: 'beat-current' }]);
  });

  it('requests both read-only resources through shared request lanes', async () => {
    const received: unknown[] = [];
    const bridge = {
      providers: {
        list: (options: unknown) => {
          received.push(options);
          return Promise.resolve({ state: 'failure' });
        },
      },
      planning: {
        listSceneBeats: (input: unknown, options: unknown) => {
          received.push(input, options);
          return Promise.resolve({ state: 'failure' });
        },
      },
    } as unknown as RendererBridgeAdapter;
    const controller = new AbortController();

    await loadGenerationSources(bridge, 'project-a', 'chapter-a', controller.signal);

    expect(received).toEqual([
      { mode: 'share', signal: controller.signal },
      { projectId: 'project-a', chapterId: 'chapter-a' },
      { mode: 'share', signal: controller.signal },
    ]);
  });
});
