export interface ReplayableAbortBoundary {
  readonly signal: AbortSignal | undefined;
  dispose(): void;
}

type AbortListener =
  | ((event: Event) => void)
  | {
      handleEvent(event: Event): void;
    };

function invokeAbortListener(listener: AbortListener, signal: AbortSignal): void {
  const event = new Event('abort');
  if (typeof listener === 'function') listener.call(signal, event);
  else listener.handleEvent(event);
}

function replayingSignal(signal: AbortSignal): AbortSignal {
  return new Proxy(signal, {
    get(target, property) {
      if (property === 'addEventListener') {
        return (
          type: string,
          listener: AbortListener | null,
          options?: boolean | AddEventListenerOptions,
        ): void => {
          target.addEventListener(type, listener, options);
          if (type === 'abort' && listener && target.aborted) {
            invokeAbortListener(listener, target);
          }
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function createReplayableAbortBoundary(parentSignal?: AbortSignal): ReplayableAbortBoundary {
  if (!parentSignal) return { signal: undefined, dispose: () => undefined };

  const controller = new AbortController();
  const abort = (): void => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener('abort', abort, { once: true });

  return {
    signal: replayingSignal(controller.signal),
    dispose: () => parentSignal.removeEventListener('abort', abort),
  };
}
