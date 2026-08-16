import { describe, expect, it, vi } from 'vitest';

import {
  inspectProviderEndpoint,
  resolveProviderEndpoint,
  validateProviderEndpoint,
  type ProviderDnsLookup,
} from '../../packages/core-service/src/provider-endpoint.js';

function unsafe(value: string): void {
  expect(() => validateProviderEndpoint(value)).toThrow(
    expect.objectContaining({ code: 'AI_ENDPOINT_UNSAFE_013' }),
  );
}

function lookupOf(...addresses: readonly { address: string; family: number }[]): ProviderDnsLookup {
  return vi.fn().mockResolvedValue(addresses);
}

describe('Provider endpoint edge coverage', () => {
  it('classifies hostname aliases, LAN ranges and global literals with exact warnings', () => {
    expect(validateProviderEndpoint('http://LOCALHOST.:11434/v1')).toMatchObject({
      scope: 'loopback',
      origin: 'http://localhost.:11434',
      secureTransport: false,
      warnings: [
        '请求仅发送到当前设备上的用户配置服务。',
        '当前连接未使用TLS，仅允许本机或受信局域网端点。',
      ],
    });
    expect(validateProviderEndpoint('http://writer.local:8080/v1')).toMatchObject({
      scope: 'lan',
      secureTransport: false,
    });
    for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.9.9']) {
      expect(validateProviderEndpoint(`http://${address}:8080/v1`)).toMatchObject({ scope: 'lan' });
    }
    expect(validateProviderEndpoint('https://8.8.8.8/v1')).toMatchObject({
      scope: 'external',
      secureTransport: true,
      warnings: ['项目内容将通过HTTPS发送到外部Provider。'],
    });
    expect(validateProviderEndpoint('https://[2606:4700:4700::1111]/v1')).toMatchObject({
      scope: 'external',
    });
  });

  it('blocks every reserved IPv4/IPv6 family plus metadata and malformed URL shapes', () => {
    for (const address of [
      '0.1.2.3',
      '100.64.0.1',
      '100.127.255.254',
      '169.254.1.2',
      '192.0.0.1',
      '192.0.2.2',
      '192.88.99.1',
      '198.18.1.1',
      '198.19.1.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      unsafe(`https://${address}/v1`);
    }
    for (const address of ['[::]', '[fe80::1]', '[fec0::1]', '[ff02::1]', '[2001:db8::2]']) {
      unsafe(`https://${address}/v1`);
    }
    unsafe('https://metadata.google.internal/v1');
    unsafe('https://example.com:0/v1');
    unsafe('https://example.com/v1?x=1');
    unsafe('https://example.com/v1#fragment');
    unsafe('https://user:secret@example.com/v1');
    unsafe('not a provider url');
  });

  it('covers IPv6 loopback, unique-local, compatible IPv4 and full-form global addresses', () => {
    expect(validateProviderEndpoint('http://[::1]:8080/v1')).toMatchObject({ scope: 'loopback' });
    expect(validateProviderEndpoint('http://[fc00::1]:8080/v1')).toMatchObject({ scope: 'lan' });
    expect(validateProviderEndpoint('http://[fd12:3456::1]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
    expect(validateProviderEndpoint('http://[::192.168.1.9]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
    expect(validateProviderEndpoint('https://[2606:4700:4700:0:0:0:0:1111]/v1')).toMatchObject({
      scope: 'external',
    });
  });

  it('returns literal bindings without DNS and normalizes bracketed IPv6', async () => {
    const lookup = vi.fn<ProviderDnsLookup>();
    await expect(
      resolveProviderEndpoint('http://127.0.0.1:11434/v1', lookup),
    ).resolves.toMatchObject({
      hostname: '127.0.0.1',
      addresses: [{ address: '127.0.0.1', family: 4 }],
    });
    await expect(resolveProviderEndpoint('http://[::1]:11434/v1', lookup)).resolves.toMatchObject({
      hostname: '::1',
      addresses: [{ address: '::1', family: 6 }],
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('maps DNS failures and empty answers to retryable connection errors', async () => {
    const failing: ProviderDnsLookup = vi.fn().mockRejectedValue(new Error('dns down'));
    await expect(
      resolveProviderEndpoint('https://api.example.com/v1', failing),
    ).rejects.toMatchObject({
      code: 'AI_CONNECTION_FAILED_003',
      retryable: true,
    });
    await expect(
      resolveProviderEndpoint('https://api.example.com/v1', lookupOf()),
    ).rejects.toMatchObject({ code: 'AI_CONNECTION_FAILED_003', retryable: true });
  });

  it('rejects malformed, mismatched, unsafe and mixed DNS answers', async () => {
    const cases: ProviderDnsLookup[] = [
      lookupOf({ address: 'not-an-ip', family: 4 }),
      lookupOf({ address: '93.184.216.34', family: 6 }),
      lookupOf({ address: '169.254.169.254', family: 4 }),
      lookupOf({ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }),
    ];
    for (const lookup of cases) {
      await expect(
        resolveProviderEndpoint('https://api.example.com/v1', lookup),
      ).rejects.toMatchObject({
        code: 'AI_ENDPOINT_UNSAFE_013',
      });
    }
  });

  it('enforces declared hostname scope and deduplicates normalized addresses on success', async () => {
    await expect(
      resolveProviderEndpoint(
        'https://api.example.com/v1',
        lookupOf({ address: '10.0.0.1', family: 4 }),
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });

    const external = lookupOf(
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    );
    const binding = await resolveProviderEndpoint('https://api.example.com/v1', external);
    expect(binding.endpoint.scope).toBe('external');
    expect(binding.addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);

    await expect(
      resolveProviderEndpoint(
        'http://writer.local:8080/v1',
        lookupOf({ address: '10.0.0.9', family: 4 }),
      ),
    ).resolves.toMatchObject({ endpoint: { scope: 'lan' } });
    await expect(
      resolveProviderEndpoint(
        'http://service.localhost:8080/v1',
        lookupOf({ address: '127.0.0.1', family: 4 }),
      ),
    ).resolves.toMatchObject({ endpoint: { scope: 'loopback' } });
  });

  it('inspection returns only validated endpoint information', async () => {
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        lookupOf({ address: '93.184.216.34', family: 4 }),
      ),
    ).resolves.toMatchObject({ scope: 'external', secureTransport: true });
  });
});
