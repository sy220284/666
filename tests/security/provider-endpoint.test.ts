import { describe, expect, it } from 'vitest';

import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
  type ProviderDnsLookup,
} from '../../packages/core-service/src/provider-endpoint.js';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { readonly code?: string }).code;
  }
  return undefined;
}

describe('M4-03 Provider endpoint boundary', () => {
  it('classifies loopback, LAN, mapped IPv6, and encrypted external endpoints', () => {
    expect(validateProviderEndpoint('http://127.0.0.1:11434/v1')).toMatchObject({
      scope: 'loopback',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('http://192.168.1.20:8080/v1')).toMatchObject({
      scope: 'lan',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('http://[::ffff:192.168.1.20]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
    expect(validateProviderEndpoint('http://[::ffff:127.0.0.1]:8080/v1')).toMatchObject({
      scope: 'loopback',
    });
    expect(validateProviderEndpoint('https://api.example.com/v1')).toMatchObject({
      scope: 'external',
      secureTransport: true,
    });
  });

  it('blocks sensitive URL components and reserved or metadata address space', () => {
    const blocked = [
      'http://api.example.com/v1',
      'http://169.254.169.254/latest',
      'https://user:secret@example.com/v1',
      'https://api.example.com/v1?api_key=secret',
      'https://api.example.com/v1#secret',
      'https://192.0.2.1/v1',
      'https://198.18.0.1/v1',
      'https://[2001:db8::1]/v1',
      'https://[fec0::1]/v1',
    ];
    for (const value of blocked) {
      expect(
        codeOf(() => validateProviderEndpoint(value)),
        value,
      ).toBe('AI_ENDPOINT_UNSAFE_013');
    }
  });

  it('blocks DNS answers that cross or change network trust boundaries', async () => {
    const mixedLookup: ProviderDnsLookup = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    const loopbackLookup: ProviderDnsLookup = async () => [
      { address: '::ffff:127.0.0.1', family: 6 },
    ];
    const metadataLookup: ProviderDnsLookup = async () => [
      { address: '169.254.169.254', family: 4 },
    ];
    const siteLocalLookup: ProviderDnsLookup = async () => [{ address: 'fec0::1', family: 6 }];

    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', mixedLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', loopbackLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', metadataLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', siteLocalLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
});
