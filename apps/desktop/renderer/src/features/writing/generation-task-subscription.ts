import { useEffect } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorGenerationStageLabel } from '../../presentation/author-status-labels.js';
import { startSingleFlightPolling } from '../../runtime/single-flight-polling.js';

export const GENERATION_FALLBACK_POLL_INTERVAL_MS = 15_000;

export interface GenerationTaskSubscriptionInput {
  readonly activeTaskId: string;
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly onStatus: (status: string) => void;
  readonly onTerminal: () => Promise<void>;
}

export function subscribeGenerationTask({
  activeTaskId,
  bridge,
  projectId,
  onStatus,
  onTerminal,
}: GenerationTaskSubscriptionInput): () => void {
  let disposed = false;
  let refreshInFlight: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    const current = Promise.resolve()
      .then(onTerminal)
      .catch(() => {
        if (!disposed) onStatus('任务状态刷新失败，请稍后重试。');
      })
      .finally(() => {
        if (refreshInFlight === current) refreshInFlight = null;
      });
    refreshInFlight = current;
    return current;
  };

  const unsubscribe = bridge.task.subscribe((update) => {
    if (disposed) return;
    const taskId = update.kind === 'event' ? update.event.taskId : update.snapshot.taskId;
    if (taskId !== activeTaskId) return;
    if (update.kind === 'event') {
      if (update.event.type === 'ai.stage') {
        onStatus(authorGenerationStageLabel(update.event.payload.stage));
      } else if (update.event.type === 'ai.delta') {
        onStatus(`正在接收建议稿 · ${update.event.payload.receivedChars} 字符`);
      } else if (
        update.event.type === 'ai.completed' ||
        update.event.type === 'ai.failed' ||
        update.event.type === 'ai.cancelled'
      ) {
        void refresh();
      }
    } else {
      const stage = authorGenerationStageLabel(update.snapshot.stage, update.snapshot.status);
      onStatus(
        update.snapshot.receivedChars
          ? `${stage} · 已接收 ${update.snapshot.receivedChars} 字`
          : stage,
      );
      if (
        update.snapshot.status === 'succeeded' ||
        update.snapshot.status === 'failed' ||
        update.snapshot.status === 'cancelled'
      ) {
        void refresh();
      }
    }
  }, projectId);
  const stopFallbackPolling = startSingleFlightPolling({
    intervalMs: GENERATION_FALLBACK_POLL_INTERVAL_MS,
    poll: refresh,
    onResult: () => undefined,
  });

  return () => {
    disposed = true;
    stopFallbackPolling();
    unsubscribe();
  };
}

export function useGenerationTaskSubscription({
  activeTaskId,
  bridge,
  projectId,
  onStatus,
  onTerminal,
}: {
  readonly activeTaskId: string | null;
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly onStatus: (status: string) => void;
  readonly onTerminal: () => Promise<void>;
}): void {
  useEffect(() => {
    if (!activeTaskId) return;
    return subscribeGenerationTask({ activeTaskId, bridge, projectId, onStatus, onTerminal });
  }, [activeTaskId, bridge, onStatus, onTerminal, projectId]);
}
