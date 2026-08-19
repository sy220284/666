import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import { DEFAULT_APP_SETTINGS } from '@worldforge/contracts';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { useAppSettingsPersistence } from '../../apps/desktop/renderer/src/app/use-app-settings-persistence.js';
import type { RendererApplicationController } from '../../apps/desktop/renderer/src/app/renderer-application-controller.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => { unmount(): void };
};

type Persistence = ReturnType<typeof useAppSettingsPersistence>;

function Probe({
  bridge,
  onValue,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly onValue: (value: Persistence) => void;
}) {
  const value = useAppSettingsPersistence({
    bridge,
    activeProject: null,
    setPendingKey: vi.fn(),
    setMessage: vi.fn(),
    setFailure: vi.fn(),
    applicationController: contractInput<RendererApplicationController>({
      applyPresentation: vi.fn(),
    }),
  });
  onValue(value);
  return createElement('div');
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('app settings reset serialization', () => {
  it('queues a save behind reset and uses the confirmed reset settings as its base', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let releaseReset!: (value: unknown) => void;
    const reset = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseReset = resolve;
        }),
    );
    const set = vi.fn().mockResolvedValue({
      state: 'success',
      generation: 2,
      requestId: '22222222-2222-4222-8222-222222222222',
      data: {
        settings: { ...DEFAULT_APP_SETTINGS, defaultMode: 'professional' },
      },
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      settings: { reset, set },
    });
    let latest!: Persistence;
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(
        createElement(Probe, {
          bridge,
          onValue: (value: Persistence) => {
            latest = value;
          },
        }),
      );
      await flush();
    });

    let resetPromise!: Promise<void>;
    let savePromise!: Promise<boolean>;
    await act(async () => {
      resetPromise = latest.resetSettings();
      savePromise = latest.saveSettings({ defaultMode: 'professional' });
      await flush();
    });
    expect(reset).toHaveBeenCalledOnce();
    expect(set).not.toHaveBeenCalled();

    await act(async () => {
      releaseReset({
        state: 'success',
        generation: 1,
        requestId: '11111111-1111-4111-8111-111111111111',
        data: { settings: DEFAULT_APP_SETTINGS },
      });
      await resetPromise;
      await savePromise;
    });
    expect(set).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultMode: 'professional',
        themeId: DEFAULT_APP_SETTINGS.themeId,
        themeVariant: DEFAULT_APP_SETTINGS.themeVariant,
      }),
    );
    await act(async () => renderer.unmount());
  });
});
