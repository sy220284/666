export interface SingleFlightPollingOptions<Value> {
  readonly intervalMs: number;
  readonly poll: () => Promise<Value>;
  readonly onResult: (value: Value) => boolean | void;
  readonly onError?: (error: unknown) => boolean | void;
  readonly schedule?: (handler: () => void, delayMs: number) => unknown;
  readonly cancelSchedule?: (handle: unknown) => void;
}

export function startSingleFlightPolling<Value>(
  options: SingleFlightPollingOptions<Value>,
): () => void {
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 0) {
    throw new Error('SINGLE_FLIGHT_POLL_INTERVAL_INVALID');
  }

  const schedule =
    options.schedule ??
    ((handler: () => void, delayMs: number): unknown => globalThis.setTimeout(handler, delayMs));
  const cancelSchedule =
    options.cancelSchedule ??
    ((handle: unknown): void => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));

  let disposed = false;
  let scheduled: unknown | null = null;

  const queue = (): void => {
    if (disposed || scheduled !== null) return;
    scheduled = schedule(run, options.intervalMs);
  };

  const run = (): void => {
    scheduled = null;
    if (disposed) return;
    void Promise.resolve()
      .then(options.poll)
      .then((value) => {
        if (disposed) return;
        if (options.onResult(value) !== false) queue();
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (options.onError?.(error) !== false) queue();
      });
  };

  queue();
  return () => {
    if (disposed) return;
    disposed = true;
    if (scheduled !== null) cancelSchedule(scheduled);
    scheduled = null;
  };
}
