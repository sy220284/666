import { useEffect } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

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
  readonly onTerminal: () => void;
}): void {
  useEffect(() => {
    if (!activeTaskId) return;
    const unsubscribe = bridge.task.subscribe((update) => {
      const taskId = update.kind === 'event' ? update.event.taskId : update.snapshot.taskId;
      if (taskId !== activeTaskId) return;
      if (update.kind === 'event') {
        if (update.event.type === 'ai.stage') {
          onStatus(`${update.event.payload.message} · ${update.event.payload.stage}`);
        } else if (update.event.type === 'ai.delta') {
          onStatus(`正在接收建议稿 · ${update.event.payload.receivedChars} 字符`);
        } else if (
          update.event.type === 'ai.completed' ||
          update.event.type === 'ai.failed' ||
          update.event.type === 'ai.cancelled'
        ) {
          onTerminal();
        }
      } else {
        onStatus(
          `${update.snapshot.stage} · ${update.snapshot.status} · ${update.snapshot.receivedChars} 字符`,
        );
        if (
          update.snapshot.status === 'succeeded' ||
          update.snapshot.status === 'failed' ||
          update.snapshot.status === 'cancelled'
        ) {
          onTerminal();
        }
      }
    }, projectId);
    const timer = setInterval(onTerminal, 1_000);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [activeTaskId, bridge, onStatus, onTerminal, projectId]);
}
