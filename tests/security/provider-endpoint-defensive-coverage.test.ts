import { isIP as realIsIP } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadWithForcedIp(forcedAddress: string, family: 4 | 6) {
  vi.resetModules();
  vi.doMock('node:net', () => ({
    isIP: (value: string) => (value === forcedAddress ? family : realIsIP(value)),
  }));
  return import('../../packages/core-service/src/provider-endpoint.js');
}

afterEach(() => {
  vi.doUnmock('node:net');
  vi.resetModules();
});

describe('Provider endpoint defensive parser coverage', () => {
  it('fails closed when an address claimed as IPv4 cannot be parsed into four octets', async () => {
    const address = '999.1.1.1';
    const { resolveProviderEndpoint } = await loadWithForcedIp(address, 4);
    const lookup = vi.fn().mockResolvedValue([{ address, family: 4 }]);
    await expect(
      resolveProviderEndpoint('https://api.example.com/v1', lookup),
    ).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });
  });

  it.each([
    ['1::2::3', 'multiple compression markers'],
    ['::999.1.1.1', 'invalid embedded IPv4'],
    ['::zzzz', 'invalid hexadecimal word'],
    ['1:2:3:4:5:6:7', 'uncompressed word count'],
    ['1:2:3:4:5:6:7:8::', 'compression without missing words'],
  ])('fails closed for malformed IPv6 parser input: %s (%s)', async (address) => {
    const { resolveProviderEndpoint } = await loadWithForcedIp(address, 6);
    const lookup = vi.fn().mockResolvedValue([{ address, family: 6 }]);
    await expect(
      resolveProviderEndpoint('https://api.example.com/v1', lookup),
    ).rejects.toMatchObject({
      code: 'AI_ENDPOINT_UNSAFE_013',
    });
  });
});
