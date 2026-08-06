import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RendererCommandCoordinator } from '../runtime/command-coordinator.js';
import type { BridgeRequestError, BridgeRequestOutcome } from './request-lifecycle.js';

export type BridgeResourceState = 'loading' | 'success' | 'failure' | 'cancelled';

export interface BridgeResource<T> {
  readonly state: BridgeResourceState;
  readonly data: T | null;
  readonly error: BridgeRequestError | null;
  readonly refresh: () => Promise<void>;
}

export interface BridgeResourceSnapshot<T> {
  readonly state: BridgeResourceState;
  readonly data: T | null;
  readonly error: BridgeRequestError | null;
}

export function bridgeResourceForQueryKey<T>(
  queryKey: string,
  resolvedKey: string | null,
  snapshot: BridgeResourceSnapshot<T>,
): BridgeResourceSnapshot<T> {
  return resolvedKey === queryKey
    ? snapshot
    : {
        state: 'loading',
        data: null,
        error: null,
      };
}

export function useBridgeQuery<T>(
  queryKey: string,
  load: () => Promise<BridgeRequestOutcome<T>>,
): BridgeResource<T> {
  const generation = useRef(0);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [state, setState] = useState<BridgeResourceState>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<BridgeRequestError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const current = ++generation.current;
    setState('loading');
    setError(null);
    const outcome = await load();
    if (current !== generation.current || outcome.state === 'stale') return;
    setResolvedKey(queryKey);
    if (outcome.state === 'success') {
      setData(outcome.data);
      setState('success');
      return;
    }
    setData(null);
    if (outcome.state === 'cancelled') {
      setState('cancelled');
      return;
    }
    setError(outcome.error);
    setState('failure');
  }, [load, queryKey]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [queryKey, refresh]);

  return {
    ...bridgeResourceForQueryKey(queryKey, resolvedKey, { state, data, error }),
    refresh,
  };
}

export interface BridgeCommand {
  readonly pending: boolean;
  readonly error: BridgeRequestError | null;
  readonly run: <T>(operation: () => Promise<BridgeRequestOutcome<T>>) => Promise<T | null>;
  readonly clearError: () => void;
}

export function useBridgeCommand(onSuccess?: () => void | Promise<void>): BridgeCommand {
  const commandCoordinator = useMemo(() => new RendererCommandCoordinator(), []);
  const commandKey = 'bridge-command';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<BridgeRequestError | null>(null);

  useEffect(
    () => () => {
      commandCoordinator.invalidate(commandKey);
    },
    [commandCoordinator],
  );

  const run = useCallback(
    async <T>(operation: () => Promise<BridgeRequestOutcome<T>>): Promise<T | null> => {
      const result = await commandCoordinator.run({
        key: commandKey,
        policy: 'reject',
        operation: async (scope) => {
          if (!scope.isCurrent()) return null;
          setPending(true);
          setError(null);
          const outcome = await operation();
          if (!scope.isCurrent()) return null;
          if (outcome.state !== 'success') {
            if (outcome.state === 'failure') setError(outcome.error);
            return null;
          }
          await onSuccess?.();
          return scope.isCurrent() ? outcome.data : null;
        },
      });

      if (result.state === 'rejected') return null;
      if (result.state === 'failed' && commandCoordinator.isLatest(commandKey, result.token)) {
        setError({
          code: 'BRIDGE_UNEXPECTED_FAILURE',
          message:
            result.error instanceof Error
              ? result.error.message
              : 'Unexpected bridge command failure.',
          retryable: true,
        });
      }
      if (commandCoordinator.isLatest(commandKey, result.token)) setPending(false);
      return result.state === 'completed' ? result.value : null;
    },
    [commandCoordinator, onSuccess],
  );

  return { pending, error, run, clearError: () => setError(null) };
}
