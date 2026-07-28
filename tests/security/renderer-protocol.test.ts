import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRendererAssetResponse,
  RENDERER_DOCUMENT_URL,
  RENDERER_SCHEMES,
  resolveRendererAsset,
} from '../../apps/desktop/main/src/renderer-protocol.js';

describe('packaged renderer protocol', () => {
  let rendererRoot: string;

  beforeEach(async () => {
    rendererRoot = await mkdtemp(path.join(tmpdir(), 'worldforge-renderer-protocol-'));
    await writeFile(path.join(rendererRoot, 'index.html'), '<h1>WorldForge</h1>', 'utf8');
    await writeFile(path.join(rendererRoot, 'index.js'), 'globalThis.ready = true;', 'utf8');
  });

  afterEach(async () => {
    await rm(rendererRoot, { recursive: true, force: true });
  });

  it('registers a standard secure scheme without CSP, worker, CORS or extension bypasses', () => {
    expect(RENDERER_SCHEMES).toEqual([
      {
        scheme: 'worldforge-app',
        privileges: {
          standard: true,
          secure: true,
          bypassCSP: false,
          allowServiceWorkers: false,
          supportFetchAPI: false,
          corsEnabled: false,
          stream: false,
          codeCache: true,
          allowExtensions: false,
        },
      },
    ]);
  });

  it('serves only allowlisted renderer assets with nosniff content types', async () => {
    expect(resolveRendererAsset(RENDERER_DOCUMENT_URL, rendererRoot)).toBe(
      path.join(rendererRoot, 'index.html'),
    );
    const html = await createRendererAssetResponse(RENDERER_DOCUMENT_URL, rendererRoot);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await html.text()).toBe('<h1>WorldForge</h1>');

    const script = await createRendererAssetResponse(
      'worldforge-app://renderer/index.js',
      rendererRoot,
    );
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  });

  it('rejects foreign hosts, unsupported files, traversal and missing assets', async () => {
    for (const url of [
      'https://renderer/index.html',
      'worldforge-app://foreign/index.html',
      'worldforge-app://renderer/secrets.json',
      'worldforge-app://renderer/%2e%2e%2fsecret.js',
      'worldforge-app://renderer/',
    ]) {
      expect(resolveRendererAsset(url, rendererRoot)).toBeNull();
      expect((await createRendererAssetResponse(url, rendererRoot)).status).toBe(404);
    }
    expect(
      (await createRendererAssetResponse('worldforge-app://renderer/missing.js', rendererRoot))
        .status,
    ).toBe(404);
  });
});
