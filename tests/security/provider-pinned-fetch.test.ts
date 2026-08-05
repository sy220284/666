import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProviderEndpointBinding } from '../../packages/core-service/src/provider-endpoint.js';
import { createPinnedProviderFetch } from '../../packages/core-service/src/provider-pinned-fetch.js';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDNe7gDe2c7o1pk
PRz+awM5WdETTBDYxOA9zjvHnjSUpKdf8CkH5gNDURCJmslfgclG9V0F6M4vhw4E
l39ghPoOCgDpPqNyUkC4NztCWXMvJauwERt6imbpoZvRWBNPpAasNwez3BNUnX9H
dB1P5ToQNN/pXiNN8Vay1fKHkFUMiX1CWqJmmS53aB4qZMR+yaCxwZdBDbgkP+l7
at/zckzevxuf9q16GMjtXENThRqkEMXXSJPuLLAwgpuAI5Agui8Aqezk5Gu3Z+dm
zeagM+RP2ljzFlw0pGwCEhsGWhfCyEve+ZinfWZbqlc1cw1W6lqVWhtGn07VuTd0
/T0WYplzAgMBAAECggEAKv+iqAfguFgciDFJqeuWxx+GYrVeKR45lnVbiRAQDLLP
24GT9HUrZaDHByR+0x+DkPezOZNX4hYu1sMlAnuRH/Lz8dsLtNaFeIcGPYIeWlVV
sghCacggdO8+ffYiRF4cj1kMoZSB7wjuI3Om1psvJUkLOfhbBupjrBSdJcUMJw0W
TXxghJDx1IoC3JYAgzoUjH4eaBf/KJozbT92g0oXWTSNBpp7eHHG60oFSs4xDFj8
HgNJzYUQ58dWWQrJt995U6vXdzZhCDhcJ971CERXzACZzIYsNmT4D/uU4eatCqa4
WyxB3MWVJqPX+Xttxk70ZOh4Nl0nl4pw7kj27BafAQKBgQDmmrVCdH8jo6PiNNiF
sfKi51hZv65eoU0/a65EPJt6G0mF17PoToCksq5bx1aLP1rVxicBdnYlRL9rQZln
aXS27uwPOgHrCtn3s3oRO7XZ1cqBCtLFDFZRvXwWGUVNBMVyFYrlr1edNoIAVmTm
0iP/USIeKA1A8vjw9qjUu4gPwQKBgQDkHMmp2YIycsaF1Q0QmEy1wzFyQSZ3Z6sr
P27iEzFFncqEEHljfKkj8q59sKEtt6EPL1h069ffw/9BtabRRF8+lzoEllqaFl7j
acu73tkPb5BGxMKDP24gcpaZtlIAlzAn0S+8BbXSeXoNX37p0XuZuqBaoDTU8DDU
M0C1xCT2MwKBgQDRsj8/tgXjF6wwSBPYx283mZ3qxvY+EPnYwQeP/3j2eZfLANIV
XkV2/xC0XrkhGLR2DqFroBhhXXmfg+CGfAvpSawZUItr+8snhupqf1ynQNTLsVbm
Xoij/eW3hrVRCxSs4FAU+vR1/poKyoUorFCVnGak+5DJzeh33iS6hel9QQKBgQDW
rx1AZDu7nPen1wZPuvZfDlCH9jbso72dmzqRPHzfxwxk1FhaQGWzNl/wXP6kVzEW
aHm4uInXx8+BGSPhyZZWAt+Ql6y3Xhx5rQUYUDg65cWERQPHoDfWA+Im0kdE1QV2
Q9LIAxvG9Zrf4SNBjWzlFpZ6FFMEoPVjkMTzDKG4rwKBgQCkhImhD1Yfupa5yshX
jsTb4Yp3VmUFYt3pr1z+QWhEfwXQqMWRHKk17Fzes/IHfDR4bx8r2upbi28S9dgJ
UDAssK4lbyFCpo2N8IQPpDFyWqQUKp6UDGNqWYmnwQmta9v94ZqSiuq3nu7ufpnW
zLZZB4rnFTftuvVQaYLvzrM9tg==
-----END PRIVATE KEY-----`;

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDKzCCAhOgAwIBAgIUEqLfKmAAhbxcBqZ7CT9E067OfhIwDQYJKoZIhvcNAQEL
BQAwGDEWMBQGA1UEAwwNcHJvdmlkZXIudGVzdDAeFw0yNjA4MDUwNzMzNTZaFw0z
NjA4MDIwNzMzNTZaMBgxFjAUBgNVBAMMDXByb3ZpZGVyLnRlc3QwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDNe7gDe2c7o1pkPRz+awM5WdETTBDYxOA9
zjvHnjSUpKdf8CkH5gNDURCJmslfgclG9V0F6M4vhw4El39ghPoOCgDpPqNyUkC4
NztCWXMvJauwERt6imbpoZvRWBNPpAasNwez3BNUnX9HdB1P5ToQNN/pXiNN8Vay
1fKHkFUMiX1CWqJmmS53aB4qZMR+yaCxwZdBDbgkP+l7at/zckzevxuf9q16GMjt
XENThRqkEMXXSJPuLLAwgpuAI5Agui8Aqezk5Gu3Z+dmzeagM+RP2ljzFlw0pGwC
EhsGWhfCyEve+ZinfWZbqlc1cw1W6lqVWhtGn07VuTd0/T0WYplzAgMBAAGjbTBr
MB0GA1UdDgQWBBSdMkrzYvf3UiLJtKoDpYLZM5SrPjAfBgNVHSMEGDAWgBSdMkrz
Yvf3UiLJtKoDpYLZM5SrPjAPBgNVHRMBAf8EBTADAQH/MBgGA1UdEQQRMA+CDXBy
b3ZpZGVyLnRlc3QwDQYJKoZIhvcNAQELBQADggEBAL+mPWWf63e3EW7yS63c4rvI
nfcCTKjh0PhLnyFMDBv1sbA3u4Sf2kkiE6zrdo8vt83frj8BcGbMMJ/6Txb0AIfY
mjVVKYeBEYco0R/3z72hasfuL5t9QzV6zB9Mb5UYYuejpQubyEtjznIKvOa+OAgg
g0vdJ49ZNfd6oqAezWiZNxjz7YFA1k4i8y4+eNN0xrAfj/WFt4cfJb5xCXDwxfXF
gT3kZlK8q9yFkMffX6wtI0QO+WAJJFeJVwPWQ8y3yUnJUEOOnUM3vVjKfXLmMyFI
GACm0Q4GdlHV1zqBnuC62ZlNJkoIzTohJQPX1wM1wLVCI10wBi+ts4L0GdkFzrg=
-----END CERTIFICATE-----`;

const servers: Array<ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>> = [];

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

async function closeServers(): Promise<void> {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
}

afterEach(closeServers);

describe('M10-11 Provider pinned transport', () => {
  it('connects to the approved address without resolving the request hostname again', async () => {
    let receivedHost = '';
    const server = createHttpServer((request, response) => {
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

  it('preserves the original hostname for HTTPS Host and TLS SNI verification', async () => {
    let receivedHost = '';
    let receivedServername = '';
    const server = createHttpsServer(
      { key: PRIVATE_KEY, cert: CERTIFICATE },
      (request, response) => {
        receivedHost = request.headers.host ?? '';
        response.end('secure');
      },
    );
    server.on('secureConnection', (socket) => {
      receivedServername = socket.servername;
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');

    const origin = `https://provider.test:${address.port}`;
    const transport = createPinnedProviderFetch(binding(origin, 'provider.test'), {
      ca: CERTIFICATE,
    });
    await expect(transport(`${origin}/v1/models`).then((response) => response.text())).resolves.toBe(
      'secure',
    );
    expect(receivedHost).toBe(`provider.test:${address.port}`);
    expect(receivedServername).toBe('provider.test');
  });

  it('rejects requests that escape the approved origin', async () => {
    const transport = createPinnedProviderFetch(binding('https://provider.test', 'provider.test'), {
      ca: CERTIFICATE,
    });
    await expect(transport('https://other.test/v1/models')).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });
  });
});
