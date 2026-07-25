import { describe, expect, it } from 'vitest';

import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
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
  it('classifies loopback, LAN, and encrypted external endpoints', () => {
    expect(validateProviderEndpoint('http://127.0.0.1:11434/v1')).toMatchObject({
      scope: 'loopback',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('http://192.168.1.20:8080/v1')).toMatchObject({
      scope: 'lan',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('https://api.example.com/v1')).toMatchObject({
      scope: 'external',
      secureTransport: true,
    });
  });

  it('blocks external plaintext, metadata, link-local, userinfo, and mixed DNS scopes', async () => {
    expect(codeOf(() => validateProviderEndpoint('http://api.example.com/v1'))).toBe(
      'AI_ENDPOINT_UNSAFE_013',
    );
    expect(codeOf(() => validateProviderEndpoint('http://169.254.169.254/latest'))).toBe(
      'AI_ENDPOINT_UNSAFE_013',
    );
    expect(codeOf(() => validateProviderEndpoint('https://user:secret@example.com/v1'))).toBe(
      'AI_ENDPOINT_UNSAFE_013',
    );
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', (async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]) as never),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
});
