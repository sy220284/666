import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  AiSetCredentialCommandSchema,
  AppGetInfoCommandSchema,
  PROTOCOL_VERSION,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import {
  productionDevToolsPolicy,
  productionFusePolicy,
} from '../../apps/desktop/main/src/fuse-policy.js';
import {
  installNavigationPolicy,
  type NavigationWebContents,
  type PreventableEvent,
} from '../../apps/desktop/main/src/navigation-policy.js';
import { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';
import {
  buildSecureWebPreferences,
  CONTENT_SECURITY_POLICY,
} from '../../apps/desktop/main/src/security-policy.js';

describe('Electron security boundary', () => {
  it('locks down every privileged BrowserWindow preference', () => {
    const preferences = buildSecureWebPreferences('/trusted/preload.cjs', true);

    expect(preferences).toMatchObject({
      preload: '/trusted/preload.cjs',
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      devTools: false,
    });
  });

  it('uses a strict CSP with no eval, remote scripts, frames, forms, or network calls', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
    expect(CONTENT_SECURITY_POLICY).not.toContain('https:');
  });

  it('denies navigation, new windows, custom schemes, and downloads', async () => {
    let navigationListener: ((event: PreventableEvent, navigationUrl: string) => void) | undefined;
    let openHandler:
      ((details: { readonly url: string }) => { readonly action: 'deny' }) | undefined;
    let downloadListener: ((event: PreventableEvent) => void) | undefined;
    const opened: string[] = [];
    const webContents: NavigationWebContents = {
      on: (_event, listener) => {
        navigationListener = listener;
      },
      setWindowOpenHandler: (handler) => {
        openHandler = handler;
      },
      session: {
        on: (_event, listener) => {
          downloadListener = listener;
        },
      },
    };

    installNavigationPolicy(webContents, 'file:///app/index.html', async (url) => {
      opened.push(url);
    });

    const navigationEvent = { preventDefault: () => opened.push('navigation-blocked') };
    navigationListener?.(navigationEvent, 'https://example.com/docs');
    expect(openHandler?.({ url: 'https://example.com/help' })).toEqual({ action: 'deny' });
    expect(openHandler?.({ url: 'worldforge://unsafe' })).toEqual({ action: 'deny' });
    downloadListener?.({ preventDefault: () => opened.push('download-blocked') });
    await Promise.resolve();

    expect(opened).toEqual([
      'navigation-blocked',
      'https://example.com/docs',
      'https://example.com/help',
      'download-blocked',
    ]);
  });

  it('defines restrictive production Electron Fuses and DevTools policy', () => {
    expect(productionFusePolicy).toEqual({
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      loadBrowserProcessSpecificV8Snapshot: true,
    });
    expect(productionDevToolsPolicy).toMatchObject({
      browserWindowDevTools: false,
      remoteDebugging: false,
    });
  });
});

describe('validated IPC contracts', () => {
  const base = {
    protocolVersion: PROTOCOL_VERSION,
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    sentAt: '2026-07-15T00:00:00.000Z',
  } as const;

  it('accepts only strict, named command envelopes', () => {
    expect(
      AppGetInfoCommandSchema.safeParse({
        ...base,
        command: 'app.getInfo',
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      AppGetInfoCommandSchema.safeParse({
        ...base,
        command: 'app.getInfo',
        payload: {},
        arbitraryChannel: 'node:fs',
      }).success,
    ).toBe(false);
  });

  it('rejects malformed provider IDs and unexpected credential fields', () => {
    expect(
      AiSetCredentialCommandSchema.safeParse({
        ...base,
        command: 'ai.provider.setCredential',
        payload: { providerId: '../escape', credential: 'test-secret' },
      }).success,
    ).toBe(false);
    expect(
      AiSetCredentialCommandSchema.safeParse({
        ...base,
        command: 'ai.provider.setCredential',
        payload: { providerId: 'openai', credential: 'test-secret', path: '/tmp/key' },
      }).success,
    ).toBe(false);
  });
});

describe('privacy-safe local facilities', () => {
  it('writes only allowlisted structured fields', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-log-'));
    const logger = new PrivacyLogger(directory, 'security-test');
    await logger.log('error', 'provider.failure', {
      requestId: 'request-1',
      errorCode: 'PROVIDER_FAILED',
      secret: 'test-super-secret',
      body: 'unpublished chapter text',
      path: '/Users/author/private.worldforge',
      rawResponse: 'private provider response',
    });

    const [filename] = await readdir(directory);
    expect(filename).toBeDefined();
    const contents = await readFile(path.join(directory, filename ?? ''), 'utf8');
    expect(contents).toContain('request-1');
    expect(contents).toContain('PROVIDER_FAILED');
    expect(contents).not.toContain('test-super-secret');
    expect(contents).not.toContain('unpublished chapter text');
    expect(contents).not.toContain('/Users/author');
    expect(contents).not.toContain('private provider response');
  });

  it('stores only encrypted credential material and returns an opaque reference', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-credential-'));
    const filePath = path.join(directory, 'credentials.v1.json');
    const broker = new CredentialBroker(
      {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'keyring',
        encryptString: (value) => Buffer.from([...value].reverse().join(''), 'utf8'),
        decryptString: (value) => [...value.toString('utf8')].reverse().join(''),
      },
      filePath,
    );

    const credentialRef = await broker.store('openai', 'test-super-secret');
    const persisted = await readFile(filePath, 'utf8');

    expect(credentialRef).toMatch(/^cred_[0-9a-f-]{36}$/);
    expect(persisted).not.toContain('test-super-secret');
    expect(await broker.has(credentialRef)).toBe(true);
    expect(await broker.resolve(credentialRef)).toBe('test-super-secret');
    expect(await broker.remove(credentialRef)).toBe(true);
    expect(await broker.has(credentialRef)).toBe(false);
  });

  it('rejects Electron safeStorage plaintext fallback', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-credential-'));
    const broker = new CredentialBroker(
      {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'basic_text',
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString('utf8'),
      },
      path.join(directory, 'credentials.v1.json'),
    );

    await expect(broker.store('openai', 'test-super-secret')).rejects.toThrow(
      'CREDENTIAL_STORE_INSECURE_BACKEND',
    );
  });
});
