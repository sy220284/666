import {
  ProviderSaveCommandSchema,
  ProviderSaveInputSchema,
  ProviderSummarySchema,
  PROTOCOL_VERSION,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

const base = {
  id: 'local-openai',
  name: '本地模型',
  protocol: 'openai_compatible' as const,
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer-model',
  timeoutMs: 30_000,
  options: {},
};

describe('M4-03 Provider contracts', () => {
  it('keeps credential references and secret-shaped options out of Renderer save input', () => {
    expect(
      ProviderSaveInputSchema.safeParse({ config: base, credential: { action: 'preserve' } })
        .success,
    ).toBe(true);
    expect(
      ProviderSaveInputSchema.safeParse({
        config: { ...base, credentialRef: 'cred_550e8400-e29b-41d4-a716-446655440000' },
        credential: { action: 'preserve' },
      }).success,
    ).toBe(false);
    expect(
      ProviderSaveInputSchema.safeParse({
        config: { ...base, options: { apiToken: 'must-not-enter-app-db' } },
        credential: { action: 'preserve' },
      }).success,
    ).toBe(false);
  });

  it('accepts strict save commands and exposes only safe Provider summaries', () => {
    expect(
      ProviderSaveCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        sentAt: '2026-07-25T01:00:00.000Z',
        command: 'ai.provider.save',
        payload: { config: base, credential: { action: 'replace', credential: 'secret-value' } },
      }).success,
    ).toBe(true);
    const summary = ProviderSummarySchema.parse({
      ...base,
      credentialConfigured: true,
      endpoint: {
        scope: 'loopback',
        origin: 'http://127.0.0.1:11434',
        secureTransport: false,
        warnings: ['请求仅发送到当前设备上的用户配置服务。'],
      },
      createdAt: '2026-07-25T01:00:00.000Z',
      updatedAt: '2026-07-25T01:00:00.000Z',
    });
    expect(JSON.stringify(summary)).not.toContain('credentialRef');
    expect(JSON.stringify(summary)).not.toContain('secret-value');
  });
});
