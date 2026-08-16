import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProviderEndpointBinding } from '../../packages/core-service/src/provider-endpoint.js';
import {
  createPinnedProviderFetch,
  providerPinnedRequestOptions,
} from '../../packages/core-service/src/provider-pinned-fetch.js';

const servers: ReturnType<typeof createServer>[] = [];

function binding(
  origin: string,
  hostname = new URL(origin).hostname,
  addresses: ProviderEndpointBinding['addresses'] = [{ address: '127.0.0.1', family: 4 }],
): ProviderEndpointBinding {
  return {
    endpoint: {
      scope: origin.startsWith('https:') ? 'external' : 'lan',
      origin,
      secureTransport: origin.startsWith('https:'),
      warnings: [],
    },
    hostname,
    addresses,
  };
}

async function localServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ origin: string; port: number }> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');
  return { origin: `http://provider.local:${address.port}`, port: address.port };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('Provider pinned transport edge coverage', () => {
  it('builds default, signal, HTTPS SNI, literal-host and custom-CA request options', () => {
    const controller = new AbortController();
    const http = providerPinnedRequestOptions(
      binding('http://provider.local', 'provider.local'),
      { address: '127.0.0.1', family: 4 },
      new URL('http://provider.local/path?x=1'),
      { signal: controller.signal, headers: { authorization: 'secret' } },
    );
    expect(http).toMatchObject({
      protocol: 'http:',
      hostname: '127.0.0.1',
      family: 4,
      port: undefined,
      method: 'GET',
      path: '/path?x=1',
      signal: controller.signal,
      headers: { authorization: 'secret', host: 'provider.local' },
      agent: false,
    });
    expect(http).not.toHaveProperty('servername');
    expect(http).not.toHaveProperty('ca');

    const httpsName = providerPinnedRequestOptions(
      binding('https://provider.test', 'provider.test'),
      { address: '203.0.113.20', family: 4 },
      new URL('https://provider.test/v1'),
      undefined,
      { ca: 'trusted-ca' },
    );
    expect(httpsName).toMatchObject({ servername: 'provider.test', ca: 'trusted-ca' });

    const httpsLiteral = providerPinnedRequestOptions(
      binding('https://127.0.0.1', '127.0.0.1'),
      { address: '127.0.0.1', family: 4 },
      new URL('https://127.0.0.1/v1'),
      { method: 'HEAD' },
    );
    expect(httpsLiteral.method).toBe('HEAD');
    expect(httpsLiteral).not.toHaveProperty('servername');
  });

  it('rejects empty bindings, Request inputs, hostname escapes and unsupported protocols', async () => {
    expect(() =>
      createPinnedProviderFetch(binding('https://provider.test', 'provider.test', [])),
    ).toThrow(expect.objectContaining({ code: 'AI_ENDPOINT_UNSAFE_013' }));

    const transport = createPinnedProviderFetch(binding('https://provider.test', 'provider.test'));
    await expect(transport(new Request('https://provider.test/v1'))).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });

    const mismatched = createPinnedProviderFetch(binding('https://provider.test', 'approved.test'));
    await expect(mismatched('https://provider.test/v1')).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });

    const ftpBinding = {
      ...binding('http://provider.local', 'provider.local'),
      endpoint: {
        ...binding('http://provider.local', 'provider.local').endpoint,
        origin: 'ftp://provider.local',
      },
    } as ProviderEndpointBinding;
    await expect(
      createPinnedProviderFetch(ftpBinding)('ftp://provider.local/file'),
    ).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });
  });

  it('serializes every supported request body and rejects unsupported FormData', async () => {
    const received: string[] = [];
    const { origin } = await localServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'));
        response.end('ok');
      });
    });
    const transport = createPinnedProviderFetch(binding(origin, 'provider.local'));
    const bodies: RequestInit['body'][] = [
      '字符串',
      new URLSearchParams({ a: '1', b: '二' }),
      new TextEncoder().encode('视图'),
      new TextEncoder().encode('数组缓冲').buffer,
      new Blob(['二进制']),
    ];
    for (const body of bodies) {
      await expect(
        transport(`${origin}/echo`, { method: 'POST', body }).then((response) => response.text()),
      ).resolves.toBe('ok');
    }
    expect(received).toEqual(['字符串', 'a=1&b=%E4%BA%8C', '视图', '数组缓冲', '二进制']);

    await expect(
      transport(`${origin}/unsupported`, { method: 'POST', body: new FormData() }),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });

  it('handles HEAD, 205 and 304 as bodyless responses and preserves status text and array headers', async () => {
    const { origin } = await localServer((request, response) => {
      if (request.url === '/head') {
        response.statusMessage = 'Head Fine';
        response.setHeader('set-cookie', ['a=1', 'b=2']);
        response.end('ignored');
        return;
      }
      const status = request.url === '/reset' ? 205 : 304;
      response.writeHead(status);
      response.end();
    });
    const transport = createPinnedProviderFetch(binding(origin, 'provider.local'));
    const head = await transport(`${origin}/head`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.statusText).toBe('Head Fine');
    expect(head.body).toBeNull();
    expect(head.headers.get('set-cookie')).toContain('a=1');
    expect((await transport(`${origin}/reset`)).body).toBeNull();
    expect((await transport(`${origin}/cached`)).status).toBe(304);
  });

  it('replays OPTIONS after an unconnected address and defaults GET replay behavior', async () => {
    const { origin, port } = await localServer((_request, response) => response.end('reachable'));
    const approved = binding(origin, 'provider.local', [
      { address: '127.0.0.2', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    const transport = createPinnedProviderFetch(approved);
    await expect(transport(`${origin}/default`).then((response) => response.text())).resolves.toBe(
      'reachable',
    );
    await expect(
      transport(`http://provider.local:${port}/options`, { method: 'OPTIONS' }).then((response) =>
        response.text(),
      ),
    ).resolves.toBe('reachable');
  });
});
