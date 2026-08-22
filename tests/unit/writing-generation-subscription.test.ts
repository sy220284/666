import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  GENERATION_FALLBACK_POLL_INTERVAL_MS,
  subscribeGenerationTask,
} from '../../apps/desktop/renderer/src/features/writing/generation-task-subscription.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function setup() {
  let listener: ((update: unknown) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((next: (update: unknown) => void) => {
    listener = next;
    return unsubscribe;
  });
  const bridge = contractInput<RendererBridgeAdapter>({ task: { subscribe } });
  return {
    bridge,
    emit: (update: unknown) => listener?.(update),
    subscribe,
    unsubscribe,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Writing Generation任务订阅', () => {
  it('轮询刷新保持单飞，完成后才允许下一次刷新', async () => {
    vi.useFakeTimers();
    const first = deferred<void>();
    const onTerminal = vi.fn(() => first.promise);
    const source = setup();
    const cleanup = subscribeGenerationTask({
      activeTaskId: 'task-a',
      bridge: source.bridge,
      projectId: 'project-a',
      onStatus: vi.fn(),
      onTerminal,
    });

    await vi.advanceTimersByTimeAsync(GENERATION_FALLBACK_POLL_INTERVAL_MS * 3);
    expect(onTerminal).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(GENERATION_FALLBACK_POLL_INTERVAL_MS);
    expect(onTerminal).toHaveBeenCalledTimes(2);

    cleanup();
    expect(source.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('终态事件与定时轮询同时到达时不会重复刷新', async () => {
    vi.useFakeTimers();
    const refresh = deferred<void>();
    const onTerminal = vi.fn(() => refresh.promise);
    const source = setup();
    const cleanup = subscribeGenerationTask({
      activeTaskId: 'task-a',
      bridge: source.bridge,
      projectId: 'project-a',
      onStatus: vi.fn(),
      onTerminal,
    });

    source.emit(
      contractInput({
        kind: 'event',
        event: { taskId: 'task-a', type: 'ai.completed', payload: {} },
      }),
    );
    await vi.advanceTimersByTimeAsync(GENERATION_FALLBACK_POLL_INTERVAL_MS);

    expect(onTerminal).toHaveBeenCalledTimes(1);
    refresh.resolve();
    cleanup();
  });

  it('忽略其他任务并映射阶段、增量和快照状态', () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const source = setup();
    const cleanup = subscribeGenerationTask({
      activeTaskId: 'task-a',
      bridge: source.bridge,
      projectId: 'project-a',
      onStatus: (status) => statuses.push(status),
      onTerminal: vi.fn(async () => undefined),
    });

    source.emit(
      contractInput({
        kind: 'event',
        event: {
          taskId: 'task-b',
          type: 'ai.stage',
          payload: { message: '忽略', stage: 'queued' },
        },
      }),
    );
    source.emit(
      contractInput({
        kind: 'event',
        event: {
          taskId: 'task-a',
          type: 'ai.stage',
          payload: { message: '准备上下文', stage: 'preparing' },
        },
      }),
    );
    source.emit(
      contractInput({
        kind: 'event',
        event: {
          taskId: 'task-a',
          type: 'ai.delta',
          payload: { receivedChars: 128 },
        },
      }),
    );
    source.emit(
      contractInput({
        kind: 'snapshot',
        snapshot: {
          taskId: 'task-a',
          stage: 'generating',
          status: 'running',
          receivedChars: 256,
        },
      }),
    );

    expect(statuses).toEqual([
      '准备上下文',
      '正在接收建议稿 · 128 字符',
      '生成建议稿 · 已接收 256 字',
    ]);
    cleanup();
  });

  it('刷新失败时给出明确状态且清理后不再回写', async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const source = setup();
    const cleanup = subscribeGenerationTask({
      activeTaskId: 'task-a',
      bridge: source.bridge,
      projectId: 'project-a',
      onStatus: (status) => statuses.push(status),
      onTerminal: vi.fn(async () => {
        throw new Error('refresh failed');
      }),
    });

    await vi.advanceTimersByTimeAsync(GENERATION_FALLBACK_POLL_INTERVAL_MS);
    expect(statuses.at(-1)).toBe('任务状态刷新失败，请稍后重试。');

    cleanup();
    await vi.advanceTimersByTimeAsync(GENERATION_FALLBACK_POLL_INTERVAL_MS * 2);
    expect(statuses).toHaveLength(1);
  });
});
