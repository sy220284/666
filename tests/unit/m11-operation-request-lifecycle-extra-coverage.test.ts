import { describe, expect, it } from 'vitest';

import {
  BridgeRequestCoordinator,
  DuplicateBridgeRequestError,
} from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import { generationOperationError } from '../../packages/core-service/src/generation-operation-error.js';
import { GenerationRunServiceError } from '../../packages/core-service/src/generation-run.js';
import { GenerationSourceResolverError } from '../../packages/core-service/src/generation-source-resolver.js';
import { TaskProtocolError } from '../../packages/core-service/src/task-protocol.js';

function instanceWithCode<T extends { readonly prototype: object }>(
  constructor: T,
  code: string,
): unknown {
  return Object.assign(Object.create(constructor.prototype) as object, { code });
}

const failure = {
  ok: false as const,
  requestId: '11111111-1111-4111-8111-111111111111',
  error: {
    code: 'COMMON_CONFLICT_003' as const,
    message: 'conflict',
    retryable: true,
  },
};

describe('M11-04 generation operation error coverage', () => {
  it('映射全部 GenerationRunServiceError 分支', () => {
    const cases = [
      ['GENERATION_RUN_NOT_FOUND', 'AI_RUN_NOT_FOUND_011'],
      ['GENERATION_RUN_TERMINAL', 'AI_RUN_ALREADY_FINISHED_012'],
      ['GENERATION_PARTIAL_DECIDED', 'AI_RUN_ALREADY_FINISHED_012'],
      ['GENERATION_BASE_CONFLICT', 'CANDIDATE_BASE_CONFLICT_002'],
      ['GENERATION_PARTIAL_UNAVAILABLE', 'COMMON_CONFLICT_003'],
      ['GENERATION_RESULT_CONFLICT', 'COMMON_CONFLICT_003'],
      ['GENERATION_RUN_NOT_ACTIVE', 'COMMON_CONFLICT_003'],
      ['GENERATION_CANDIDATE_INVALID', 'AI_OUTPUT_INVALID_008'],
      ['GENERATION_MODEL_SUPPORT_INVALID', 'AI_OUTPUT_INVALID_008'],
    ] as const;
    for (const [code, expected] of cases) {
      expect(generationOperationError(instanceWithCode(GenerationRunServiceError, code))).toBe(
        expected,
      );
    }
  });

  it('映射全部 GenerationSourceResolverError、TaskProtocolError 和通用 code 分支', () => {
    const sourceCases = [
      ['GENERATION_SOURCE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
      ['GENERATION_SOURCE_STALE', 'CANDIDATE_BASE_CONFLICT_002'],
      ['GENERATION_SOURCE_LOCKED', 'DRAFT_BLOCK_LOCKED_003'],
      ['GENERATION_SOURCE_INVALID', 'COMMON_INVALID_INPUT_001'],
    ] as const;
    for (const [code, expected] of sourceCases) {
      expect(generationOperationError(instanceWithCode(GenerationSourceResolverError, code))).toBe(
        expected,
      );
    }

    expect(
      generationOperationError(instanceWithCode(TaskProtocolError, 'COMMON_CANCELLED_004')),
    ).toBe('COMMON_CANCELLED_004');
    expect(generationOperationError({ code: 'COMMON_NOT_FOUND_002' })).toBe(
      'COMMON_NOT_FOUND_002',
    );
    expect(typeof generationOperationError({ code: 'NOT_A_CONTRACT_ERROR' })).toBe('string');
    expect(typeof generationOperationError(null)).toBe('string');
  });
});

describe('M11-04 BridgeRequestCoordinator edge coverage', () => {
  it('区分 AbortError、aborted message 与非 Error 异常', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const namedAbort = new Error('cancelled');
    namedAbort.name = 'AbortError';

    await expect(
      coordinator.run('named-abort', async () => {
        throw namedAbort;
      }),
    ).resolves.toMatchObject({ state: 'cancelled' });
    await expect(
      coordinator.run('message-abort', async () => {
        throw new Error('request aborted downstream');
      }),
    ).resolves.toMatchObject({ state: 'cancelled' });
    await expect(
      coordinator.run('string-error', async () => {
        throw 'boom';
      }),
    ).resolves.toMatchObject({
      state: 'failure',
      error: { code: 'BRIDGE_UNEXPECTED_FAILURE', message: 'Unexpected bridge request failure.' },
    });
  });

  it('拒绝重复 immediate 请求，并允许 replace 原子替换旧请求', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let release = () => undefined;
    let started = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startGate = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = coordinator.run('replace-key', async () => {
      started();
      await gate;
      return { ok: true as const, requestId: 'first', data: 1 };
    });
    await startGate;
    expect(coordinator.isPending('replace-key')).toBe(true);
    await expect(
      coordinator.run('replace-key', async () => ({ ok: true as const, requestId: 'duplicate', data: 2 })),
    ).rejects.toBeInstanceOf(DuplicateBridgeRequestError);

    const replacement = coordinator.run(
      'replace-key',
      async () => ({ ok: true as const, requestId: 'second', data: 2 }),
      { mode: 'replace' },
    );
    release();
    await expect(first).resolves.toMatchObject({ state: 'stale', generation: 1 });
    await expect(replacement).resolves.toMatchObject({ state: 'success', generation: 2, data: 2 });
    expect(coordinator.isPending('replace-key')).toBe(false);
    expect(coordinator.cancel('missing-key')).toBe(false);
  });

  it('处理调用前已取消的 signal，并保留 stale generation', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const abort = new AbortController();
    abort.abort('screen-changed');
    await expect(
      coordinator.run(
        'pre-aborted',
        async () => ({ ok: true as const, requestId: 'never-visible', data: 1 }),
        { signal: abort.signal },
      ),
    ).resolves.toEqual({ state: 'stale', generation: 1 });
  });

  it('取消 latest-only lane 时同时清理 in-flight 与 pending 请求', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let markStarted = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const operation = async ({ signal }: { readonly signal: AbortSignal }) => {
      markStarted();
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return { ok: true as const, requestId: 'lane-result', data: 1 };
    };
    const laneKey = 'story-knowledge:lane';
    const first = coordinator.run('ignored-first', operation, {
      mode: 'replace',
      laneKey,
    });
    await started;
    const second = coordinator.run('ignored-second', operation, {
      mode: 'replace',
      laneKey,
    });
    expect(coordinator.isPending('unused', laneKey)).toBe(true);
    expect(coordinator.cancel('unused', laneKey)).toBe(true);
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await expect(second).resolves.toMatchObject({ state: 'stale' });
    expect(coordinator.cancel('unused', 'missing-lane')).toBe(false);
  });

  it('覆盖 latest-only failure、cancelled 与 stale outcome 重绑 generation', async () => {
    const failureCoordinator = new BridgeRequestCoordinator();
    await expect(
      failureCoordinator.run('failure', async () => failure, {
        mode: 'replace',
        laneKey: 'failure-lane',
      }),
    ).resolves.toMatchObject({ state: 'failure', generation: 1 });

    const cancelledCoordinator = new BridgeRequestCoordinator();
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    await expect(
      cancelledCoordinator.run(
        'cancelled',
        async () => {
          throw abortError;
        },
        { mode: 'replace', laneKey: 'cancelled-lane' },
      ),
    ).resolves.toMatchObject({ state: 'cancelled', generation: 1 });

    const staleCoordinator = new BridgeRequestCoordinator();
    const abort = new AbortController();
    abort.abort('already-gone');
    await expect(
      staleCoordinator.run(
        'stale',
        async () => ({ ok: true as const, requestId: 'stale', data: 1 }),
        { mode: 'replace', laneKey: 'stale-lane', signal: abort.signal },
      ),
    ).resolves.toEqual({ state: 'stale', generation: 1 });
  });

  it('共享订阅者在订阅前已取消时立即 detach 并取消底层请求', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const abort = new AbortController();
    abort.abort('unmounted');
    let underlyingAborted = false;
    const outcome = coordinator.run(
      'pre-aborted-share',
      async ({ signal }) => {
        if (signal.aborted) underlyingAborted = true;
        return new Promise<{ readonly ok: true; readonly requestId: string; readonly data: number }>(
          () => undefined,
        );
      },
      { mode: 'share', signal: abort.signal },
    );
    await expect(outcome).resolves.toMatchObject({ state: 'stale' });
    await Promise.resolve();
    expect(underlyingAborted).toBe(true);
  });
});
