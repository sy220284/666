import { useCallback, useEffect, useRef, useState } from 'react';

import type { BridgeRequestError, BridgeRequestOutcome } from './request-lifecycle.js';

export type BridgeResourceState = 'loading' | 'success' | 'failure';

export interface BridgeResource<T> {
  readonly state: BridgeResourceState;
  readonly data: T | null;
  readonly error: BridgeRequestError | null;
  readonly refresh: () => Promise<void>;
}

export function useBridgeQuery<T>(
  queryKey: string,
  load: () => Promise<BridgeRequestOutcome<T>>,
): BridgeResource<T> {
  const generation = useRef(0);
  const [state, setState] = useState<BridgeResourceState>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<BridgeRequestError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const current = ++generation.current;
    setState('loading');
    setError(null);
    const outcome = await load();
    if (current !== generation.current || outcome.state === 'stale') return;
    if (outcome.state === 'success') {
      setData(outcome.data);
      setState('success');
      return;
    }
    if (outcome.state === 'failure') setError(outcome.error);
    setState('failure');
  }, [load]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [queryKey, refresh]);

  return { state, data, error, refresh };
}

export interface BridgeCommand {
  readonly pending: boolean;
  readonly error: BridgeRequestError | null;
  readonly run: <T>(operation: () => Promise<BridgeRequestOutcome<T>>) => Promise<T | null>;
  readonly clearError: () => void;
}

export function useBridgeCommand(onSuccess?: () => void | Promise<void>): BridgeCommand {
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<BridgeRequestError | null>(null);

  const run = useCallback(
    async <T>(operation: () => Promise<BridgeRequestOutcome<T>>): Promise<T | null> => {
      if (pendingRef.current) return null;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      try {
        const outcome = await operation();
        if (outcome.state !== 'success') {
          if (outcome.state === 'failure') setError(outcome.error);
          return null;
        }
        await onSuccess?.();
        return outcome.data;
      } catch (cause) {
        setError({
          code: 'BRIDGE_UNEXPECTED_FAILURE',
          message: cause instanceof Error ? cause.message : 'Unexpected bridge command failure.',
          retryable: true,
        });
        return null;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [onSuccess],
  );

  return { pending, error, run, clearError: () => setError(null) };
}
