import { createRequire } from 'node:module';

import type { ProjectContinuationSnapshot } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const capture = vi.hoisted(() => ({
  returnLocation: null as unknown,
  core: vi.fn(),
  historical: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/state/ui-store.js', () => ({
  useRendererUiStore: (selector: (state: unknown) => unknown) =>
    selector({ returnLocation: capture.returnLocation }),
}));
vi.mock(
  '../../apps/desktop/renderer/src/features/writing/historical-navigation-notice.js',
  () => ({
    HistoricalNavigationNotice: (props: Record<string, unknown>) => {
      capture.historical(props);
      return null;
    },
  }),
);
vi.mock('../../apps/desktop/renderer/src/features/writing/writing-core-workbench.js', () => ({
  WritingWorkbench: (props: Record<string, unknown>) => {
    capture.core(props);
    return null;
  },
}));

import { WritingWorkbench } from '../../apps/desktop/renderer/src/features/writing/writing-workbench.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => { update(element: ReactElement): void; unmount(): void };
};

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const blockId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';

function success<T>(data: T) {
  return { state: 'success' as const, data };
}
function failure() {
  return {
    state: 'failure' as const,
    error: { code: 'COMMON_INTERNAL_999' as const, message: 'failure', retryable: true },
  };
}
function continuation(panel: 'editor' | 'versions' | 'candidates' = 'editor') {
  return contractInput<ProjectContinuationSnapshot>({
    projectId,
    chapterId,
    draftId,
    draftRevision: 3,
    logicalBlockId: blockId,
    expectedBlockHash: 'a'.repeat(64),
    cursorOffset: 10,
    scrollTop: 20,
    panel,
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function lastCore(): Record<string, unknown> {
  const call = capture.core.mock.calls.at(-1);
  if (!call) throw new Error('Missing core workbench props');
  return contractInput<Record<string, unknown>>(call[0]);
}
function fn<T extends (...args: never[]) => unknown>(value: unknown): T {
  if (typeof value !== 'function') throw new Error('Expected function');
  return contractInput<T>(value);
}
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeBridge(overrides: Record<string, object> = {}) {
  const planning = {
    listStructure: vi.fn().mockResolvedValue(success({ volumes: [] })),
    passthrough: vi.fn(),
    ...(overrides.planning ?? {}),
  };
  const project = {
    saveContinuation: vi.fn().mockImplementation((input: unknown) => success(input)),
    passthrough: vi.fn(),
    ...(overrides.project ?? {}),
  };
  const draft = {
    open: vi.fn().mockResolvedValue(
      success({ draftId: '66666666-6666-4666-8666-666666666666', revision: 8 }),
    ),
    ...(overrides.draft ?? {}),
  };
  const version = {
    create: vi.fn().mockResolvedValue(success({ versionId })),
    restore: vi.fn().mockResolvedValue(success({ draftId, revision: 4 })),
    passthrough: vi.fn(),
    ...(overrides.version ?? {}),
  };
  return {
    adapter: contractInput<RendererBridgeAdapter>({ planning, project, draft, version }),
    planning,
    project,
    draft,
    version,
  };
}

function element(
  adapter: RendererBridgeAdapter,
  options: {
    panel?: 'editor' | 'versions' | 'candidates';
    initial?: ProjectContinuationSnapshot | null;
    onPanelChange?: ReturnType<typeof vi.fn>;
    navigation?: boolean;
  } = {},
) {
  return createElement(WritingWorkbench, {
    bridge: adapter,
    disclosureMode: 'professional',
    project: contractInput({ projectId, name: '作品' }),
    initialContinuation: options.initial === undefined ? continuation() : options.initial,
    panel: options.panel ?? 'editor',
    navigationChapterId: options.navigation ? chapterId : null,
    navigationLogicalBlockId: options.navigation ? blockId : null,
    navigationVersionId: options.navigation ? versionId : null,
    navigationQuery: null,
    navigationGenerationMode: null,
    onNavigate: vi.fn(),
    onPanelChange: options.onPanelChange ?? vi.fn(),
    onReturn: vi.fn(),
    onStatus: vi.fn(),
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
    run();
    return 1;
  });
  capture.returnLocation = null;
  capture.core.mockClear();
  capture.historical.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WritingWorkbench wrapper coverage', () => {
  it('renders return and historical notices and forwards the expected continuation', async () => {
    capture.returnLocation = { route: 'checks' };
    const { adapter } = makeBridge();
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter, { panel: 'versions', navigation: true }));
      await flush();
    });
    expect(capture.historical).toHaveBeenCalledOnce();
    expect(lastCore().initialContinuation).toMatchObject({ projectId, panel: 'editor' });
    await act(async () => renderer.unmount());
  });

  it('persists panel changes with the latest continuation and accepts successful updates', async () => {
    const nextContinuation = continuation('candidates');
    const saveContinuation = vi.fn().mockResolvedValue(success(nextContinuation));
    const { adapter } = makeBridge({ project: { saveContinuation } });
    const onPanelChange = vi.fn();
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter, { onPanelChange }));
      await flush();
    });
    await act(async () => {
      fn<(panel: 'candidates') => void>(lastCore().onPanelChange)('candidates');
      await flush();
    });
    expect(onPanelChange).toHaveBeenCalledWith('candidates');
    expect(saveContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, panel: 'candidates' }),
      { mode: 'replace' },
    );
    expect(lastCore().initialContinuation).toEqual(nextContinuation);
    await act(async () => renderer.unmount());
  });

  it('handles panel changes without a continuation and refreshes callback refs after prop changes', async () => {
    const { adapter } = makeBridge();
    const first = vi.fn();
    const second = vi.fn();
    let renderer!: { update(element: ReactElement): void; unmount(): void };
    await act(async () => {
      renderer = create(element(adapter, { initial: null, onPanelChange: first }));
      await flush();
    });
    await act(async () => {
      renderer.update(element(adapter, { initial: null, onPanelChange: second }));
      await flush();
    });
    await act(async () => {
      fn<(panel: 'versions') => void>(lastCore().onPanelChange)('versions');
      await flush();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('versions');
    await act(async () => renderer.unmount());
  });

  it('deduplicates structure loads per project and clears both resolved and rejected requests', async () => {
    const first = deferred<ReturnType<typeof success>>();
    const second = deferred<ReturnType<typeof success>>();
    const listStructure = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValue(success({ volumes: [] }));
    const { adapter } = makeBridge({ planning: { listStructure } });
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter));
      await flush();
    });
    const bridged = contractInput<RendererBridgeAdapter>(lastCore().bridge);
    const requestA = bridged.planning.listStructure(projectId);
    const requestB = bridged.planning.listStructure(projectId);
    expect(requestA).toBe(requestB);
    expect(listStructure).toHaveBeenCalledTimes(1);
    const other = bridged.planning.listStructure('99999999-9999-4999-8999-999999999999');
    expect(listStructure).toHaveBeenCalledTimes(2);
    first.resolve(success({ volumes: [] }));
    second.reject(new Error('expected'));
    await Promise.allSettled([requestA, other]);
    await bridged.planning.listStructure(projectId);
    expect(listStructure).toHaveBeenCalledTimes(3);
    expect(bridged.planning.passthrough).toBe(adapter.planning.passthrough);
    await act(async () => renderer.unmount());
  });

  it('overrides continuation panel and forwards successful continuation to wrapper state', async () => {
    const saved = continuation('versions');
    const saveContinuation = vi.fn().mockResolvedValue(success(saved));
    const { adapter } = makeBridge({ project: { saveContinuation } });
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter, { panel: 'versions' }));
      await flush();
    });
    const bridged = contractInput<RendererBridgeAdapter>(lastCore().bridge);
    await act(async () => {
      await bridged.project.saveContinuation(continuation('editor'), { mode: 'replace' });
      await flush();
    });
    expect(saveContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ panel: 'versions' }),
      { mode: 'replace' },
    );
    expect(lastCore().initialContinuation).toEqual(saved);
    expect(bridged.project.passthrough).toBe(adapter.project.passthrough);
    await act(async () => renderer.unmount());
  });

  it('rebases version creation on the latest draft and preserves draft-open failure', async () => {
    const createVersion = vi.fn().mockResolvedValue(success({ versionId }));
    const open = vi
      .fn()
      .mockResolvedValueOnce(success({ draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 9 }))
      .mockResolvedValueOnce(failure());
    const { adapter } = makeBridge({ draft: { open }, version: { create: createVersion } });
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter));
      await flush();
    });
    const bridged = contractInput<RendererBridgeAdapter>(lastCore().bridge);
    await bridged.version.create(
      contractInput({ projectId, chapterId, draftId, baseRevision: 1, title: '版本' }),
      { mode: 'replace' },
    );
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        baseRevision: 9,
      }),
      { mode: 'replace' },
    );
    const failed = await bridged.version.create(
      contractInput({ projectId, chapterId, draftId, baseRevision: 1, title: '版本二' }),
      { mode: 'replace' },
    );
    expect(failed.state).toBe('failure');
    expect(bridged.version.passthrough).toBe(adapter.version.passthrough);
    await act(async () => renderer.unmount());
  });

  it('moves to editor after a successful restore, publishes and consumes restore notice, and ignores failure', async () => {
    const restore = vi
      .fn()
      .mockResolvedValueOnce(success({ draftId, revision: 4 }))
      .mockResolvedValueOnce(failure());
    const { adapter } = makeBridge({ version: { restore } });
    const onPanelChange = vi.fn();
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(element(adapter, { panel: 'versions', onPanelChange }));
      await flush();
    });
    const bridged = contractInput<RendererBridgeAdapter>(lastCore().bridge);
    await act(async () => {
      await bridged.version.restore(contractInput({ projectId, chapterId, versionId }), {
        mode: 'replace',
      });
      await flush();
    });
    expect(onPanelChange).toHaveBeenCalledWith('editor');
    expect(lastCore().statusNotice).toBe('已从只读历史版本恢复为新当前稿。');
    await act(async () => {
      fn<() => void>(lastCore().onStatusNoticeConsumed)();
      await flush();
    });
    expect(lastCore().statusNotice).toBeNull();
    onPanelChange.mockClear();
    await bridged.version.restore(contractInput({ projectId, chapterId, versionId }), {
      mode: 'replace',
    });
    expect(onPanelChange).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
