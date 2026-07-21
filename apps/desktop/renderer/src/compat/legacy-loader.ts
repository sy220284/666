export type LegacyCompatibilityState = 'idle' | 'loading' | 'loaded' | 'disposing';

export interface LegacyCompatibilityLoader {
  readonly state: LegacyCompatibilityState;
  load(): Promise<void>;
  dispose(): Promise<void>;
}

export function createLegacyCompatibilityLoader(
  loadLegacy: () => void | Promise<void>,
  disposeLegacy: () => void | Promise<void> = () => undefined,
): LegacyCompatibilityLoader {
  let state: LegacyCompatibilityState = 'idle';
  let loadPromise: Promise<void> | null = null;
  let disposePromise: Promise<void> | null = null;

  return {
    get state() {
      return state;
    },

    load() {
      if (state === 'loaded') return Promise.resolve();
      if (loadPromise) return loadPromise;
      if (disposePromise) {
        return disposePromise.then(() => this.load());
      }

      state = 'loading';
      loadPromise = Promise.resolve()
        .then(loadLegacy)
        .then(() => {
          state = 'loaded';
        })
        .catch((error: unknown) => {
          state = 'idle';
          throw error;
        })
        .finally(() => {
          loadPromise = null;
        });
      return loadPromise;
    },

    dispose() {
      if (disposePromise) return disposePromise;
      disposePromise = Promise.resolve()
        .then(async () => {
          if (loadPromise) await loadPromise;
          if (state !== 'loaded') return;
          state = 'disposing';
          await disposeLegacy();
          state = 'idle';
        })
        .finally(() => {
          disposePromise = null;
        });
      return disposePromise;
    },
  };
}
