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
  hostname: string,
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

describe('M10-11 Provider pinned transport', () => {
  it('connects to the approved address without resolving the request hostname again', async () => {
    let receivedHost = '';
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? '';
      response.end('bound');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');

    const origin = `http://provider.local:${address.port}`;
    const transport = createPinnedProviderFetch(binding(origin, 'provider.local'));
    await expect(
      transport(`${origin}/v1/models`).then((response) => response.text()),
    ).resolves.toBe('bound');
    expect(receivedHost).toBe(`provider.local:${address.port}`);
  });

  it('represents an approved empty response without constructing an invalid body stream', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');

    const origin = `http://provider.local:${address.port}`;
    const response = await createPinnedProviderFetch(binding(origin, 'provider.local'))(
      `${origin}/health`,
    );

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe('');
  });

  it('binds the socket address while preserving the original HTTPS Host and TLS SNI name', () => {
    const origin = 'https://provider.test:9443';
    const request = providerPinnedRequestOptions(
      binding(origin, 'provider.test'),
      { address: '203.0.113.20', family: 4 },
      new URL(`${origin}/v1/models`),
      { method: 'GET' },
    );

    expect(request).toMatchObject({
      protocol: 'https:',
      hostname: '203.0.113.20',
      family: 4,
      port: '9443',
      servername: 'provider.test',
      headers: { host: 'provider.test:9443' },
    });
  });

  it('rejects requests that escape the approved origin', async () => {
    const transport = createPinnedProviderFetch(binding('https://provider.test', 'provider.test'));
    await expect(transport('https://other.test/v1/models')).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });
  });

  it('fails over a POST when the first approved address never establishes a connection', async () => {
    let received = 0;
    const server = createServer((request, response) => {
      request.resume();
      request.once('end', () => {
        received += 1;
        response.end('accepted');
      });
    });
    server.listen(0, '127.0.0.2');
    await once(server, 'listening');
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');

    const origin = `http://provider.local:${address.port}`;
    const transport = createPinnedProviderFetch(
      binding(origin, 'provider.local', [
        { address: '127.0.0.1', family: 4 },
        { address: '127.0.0.2', family: 4 },
      ]),
    );

    await expect(
      transport(`${origin}/v1/chat/completions`, { method: 'POST', body: 'generation' }).then(
        (response) => response.text(),
      ),
    ).resolves.toBe('accepted');
    expect(received).toBe(1);
  });

  it('does not replay a POST after the first approved address receives it', async () => {
    let firstReceives = 0;
    let secondReceives = 0;
    const first = createServer((request) => {
      request.resume();
      request.once('end', () => {
        firstReceives += 1;
        request.socket.destroy();
      });
    });
    first.listen(0, '127.0.0.1');
    await once(first, 'listening');
    servers.push(first);
    const firstAddress = first.address();
    if (!firstAddress || typeof firstAddress === 'string') {
      throw new Error('SERVER_ADDRESS_MISSING');
    }

    const second = createServer((request, response) => {
      request.resume();
      request.once('end', () => {
        secondReceives += 1;
        response.end('duplicate');
      });
    });
    second.listen(firstAddress.port, '127.0.0.2');
    await once(second, 'listening');
    servers.push(second);

    const origin = `http://provider.local:${firstAddress.port}`;
    const transport = createPinnedProviderFetch(
      binding(origin, 'provider.local', [
        { address: '127.0.0.1', family: 4 },
        { address: '127.0.0.2', family: 4 },
      ]),
    );

    await expect(
      transport(`${origin}/v1/chat/completions`, { method: 'POST', body: 'billable' }),
    ).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(firstReceives).toBe(1);
    expect(secondReceives).toBe(0);
  });
});
