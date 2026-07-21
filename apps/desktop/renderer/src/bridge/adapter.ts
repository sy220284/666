import type { CommandResult, WorldforgeBridge } from '@worldforge/contracts';

export type LatestRequestToken = Readonly<{ isCurrent: () => boolean }>;

export function createLatestRequestGate() {
  let generation = 0;
  return {
    issue(): LatestRequestToken {
      generation += 1;
      const issued = generation;
      return { isCurrent: () => issued === generation };
    },
    invalidate(): void {
      generation += 1;
    },
  } as const;
}

export type RendererInvokeOptions = Readonly<{
  signal?: AbortSignal;
  latest?: LatestRequestToken;
  key?: string;
  replacePending?: boolean;
}>;

export type RendererInvokeResult<T> =
  | Readonly<{ status: 'success'; requestId: string; data: T }>
  | Readonly<{
      status: 'failure';
      requestId?: string;
      code: string;
      message: string;
      retryable: boolean;
      diagnosticId?: string;
    }>
  | Readonly<{ status: 'cancelled' }>
  | Readonly<{ status: 'stale' }>;

const browserBridge = (): WorldforgeBridge =>
  window.worldforge as unknown as WorldforgeBridge;

export function createRendererBridgeAdapter(bridge?: WorldforgeBridge) {
  const source = () => bridge ?? browserBridge();
  const pending = new Map<string, AbortController>();

  return {
    bridge: {
      app: {
        getInfo: () => source().app.getInfo(),
        getCoreStatus: () => source().app.getCoreStatus(),
        restartCore: () => source().app.restartCore(),
        getWindowPreferences: () => source().app.getWindowPreferences(),
        setAppearancePreferences: (
          preferences: Parameters<WorldforgeBridge['app']['setAppearancePreferences']>[0],
        ) => source().app.setAppearancePreferences(preferences),
      },
      settings: {
        get: () => source().settings.get(),
        set: (settings: Parameters<WorldforgeBridge['settings']['set']>[0]) =>
          source().settings.set(settings),
        reset: () => source().settings.reset(),
      },
      project: {
        listRecent: () => source().project.listRecent(),
        relocateRecent: (projectId: string) => source().project.relocateRecent(projectId),
        removeRecent: (projectId: string) => source().project.removeRecent(projectId),
        getActive: () => source().project.getActive(),
        create: (input: Parameters<WorldforgeBridge['project']['create']>[0]) =>
          source().project.create(input),
        openSelected: () => source().project.openSelected(),
        openRecent: (projectId: string) => source().project.openRecent(projectId),
        close: (projectId: string) => source().project.close(projectId),
        move: (projectId: string) => source().project.move(projectId),
      },
    },
    async invoke<T>(
      operation: (bridge: WorldforgeBridge) => Promise<CommandResult<T>>,
      options: RendererInvokeOptions = {},
    ): Promise<RendererInvokeResult<T>> {
      if (options.signal?.aborted) return { status: 'cancelled' };
      const key = options.key;
      if (key && pending.has(key)) {
        if (!options.replacePending) {
          return {
            status: 'failure',
            code: 'RENDERER_REQUEST_PENDING',
            message: `Request ${key} is already pending.`,
            retryable: true,
          };
        }
        pending.get(key)?.abort();
        pending.delete(key);
      }

      const controller = new AbortController();
      if (key) pending.set(key, controller);
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await operation(source());
        if (controller.signal.aborted || options.signal?.aborted) {
          return { status: 'cancelled' };
        }
        if (options.latest && !options.latest.isCurrent()) return { status: 'stale' };
        if (result.ok) {
          return { status: 'success', requestId: result.requestId, data: result.data };
        }
        return {
          status: 'failure',
          requestId: result.requestId,
          code: result.error.code,
          message: result.error.message,
          retryable: result.error.retryable,
          ...(result.error.diagnosticId ? { diagnosticId: result.error.diagnosticId } : {}),
        };
      } catch (error) {
        if (controller.signal.aborted || options.signal?.aborted) {
          return { status: 'cancelled' };
        }
        return {
          status: 'failure',
          code: 'RENDERER_BRIDGE_FAILURE',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        };
      } finally {
        options.signal?.removeEventListener('abort', cancel);
        if (key && pending.get(key) === controller) pending.delete(key);
      }
    },
    cancel(key: string): void {
      pending.get(key)?.abort();
      pending.delete(key);
    },
  } as const;
}
