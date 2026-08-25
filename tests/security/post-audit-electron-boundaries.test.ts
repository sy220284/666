import { describe, expect, it, vi } from 'vitest';

import { createIpcHandlerContext } from '../../apps/desktop/main/src/handler-guard.js';
import { isExternalWebUrl } from '../../apps/desktop/main/src/navigation-policy.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '00000000-0000-4000-8000-000000000099';
const rendererUrl = 'worldforge://app/index.html';

type HandlerOptions = Parameters<typeof createIpcHandlerContext>[0];
type Handler = (event: unknown, raw: unknown) => unknown;

function createContext() {
  const handlers = new Map<string, Handler>();
  const ipcMain = strictTestDouble(
    'IpcMain',
    contractInput<Partial<HandlerOptions['ipcMain']>>({
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    }),
  );
  const context = createIpcHandlerContext({
    ipcMain,
    supervisor: strictTestDouble(
      'CoreSupervisor',
      contractInput<Partial<HandlerOptions['supervisor']>>({}),
    ),
    credentialBroker: strictTestDouble(
      'CredentialBroker',
      contractInput<Partial<HandlerOptions['credentialBroker']>>({}),
    ),
    rendererUrl,
    version: '1.0.0',
    platform: 'test',
    logger: strictTestDouble(
      'PrivacyLogger',
      contractInput<Partial<HandlerOptions['logger']>>({ log: vi.fn(async () => undefined) }),
    ),
    getWindowPreferences: () => ({
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    setAppearancePreferences: vi.fn(async (preferences) => ({
      ...preferences,
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    })),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });
  return { context, handlers };
}

describe('post-audit Electron boundary hardening', () => {
  it('rejects an untrusted IPC sender before the business handler runs', async () => {
    const { context, handlers } = createContext();
    const businessHandler = vi.fn(async () => ({ ok: true }));
    context.register('worldforge:test:central-origin-guard', businessHandler);
    const handler = handlers.get('worldforge:test:central-origin-guard');
    if (!handler) throw new Error('TEST_HANDLER_MISSING');

    await expect(
      handler({ senderFrame: { url: 'https://attacker.invalid/' } }, { requestId }),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001', retryable: false },
    });
    expect(businessHandler).not.toHaveBeenCalled();
  });

  it('allows the trusted renderer through the same central IPC guard', async () => {
    const { context, handlers } = createContext();
    const businessHandler = vi.fn(async () => ({ accepted: true }));
    context.register('worldforge:test:central-origin-guard', businessHandler);
    const handler = handlers.get('worldforge:test:central-origin-guard');
    if (!handler) throw new Error('TEST_HANDLER_MISSING');

    await expect(handler({ senderFrame: { url: rendererUrl } }, { requestId })).resolves.toEqual({
      accepted: true,
    });
    expect(businessHandler).toHaveBeenCalledTimes(1);
  });

  it('only classifies explicitly trusted HTTPS navigation as externally openable', () => {
    expect(isExternalWebUrl('https://github.com/sy220284/666')).toBe(true);
    expect(isExternalWebUrl('http://github.com/sy220284/666')).toBe(false);
    expect(isExternalWebUrl('https://github.com.evil.example/')).toBe(false);
    expect(isExternalWebUrl('https://user@github.com/sy220284/666')).toBe(false);
    expect(isExternalWebUrl('https://example.com/')).toBe(false);
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
  });
});
