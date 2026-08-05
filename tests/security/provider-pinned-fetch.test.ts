import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProviderEndpointBinding } from '../../packages/core-service/src/provider-endpoint.js';
import {
  createPinnedProviderFetch,
  providerPinnedRequestOptions,
} from '../../packages/core-service/src/provider-pinned-fetch.js';

const servers: ReturnType<typeof createServer>[] = [];

function binding(origin: string, hostname: string): ProviderEndpointBinding {
  return {
    endpoint: {
      scope: origin.startsWith('https:') ? 'external' : 'lan',
      origin,
      secureTransport: origin.startsWith('https:'),
      warnings: [],
    },
    hostname,
    addresses: [{ address: '127.0.0.1', family: 4 }],
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
    await expect(transport(`${origin}/v1/models`).then((response) => response.text())).resolves.toBe(
      'bound',
    );
    expect(receivedHost).toBe(`provider.local:${address.port}`);
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
});
