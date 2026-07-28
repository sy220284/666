import { describe, expect, it } from 'vitest';

import type { ProviderSummary } from '@worldforge/contracts';

import { resolveAiReadiness } from '../../apps/desktop/renderer/src/runtime/ai-readiness.js';

const provider = {
  id: 'local',
  name: '本地模型',
  protocol: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer',
  timeoutMs: 30_000,
  options: {},
  credentialConfigured: false,
  endpoint: {
    scope: 'loopback',
    origin: 'http://127.0.0.1:11434',
    secureTransport: false,
    warnings: [],
  },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
} satisfies ProviderSummary;

describe('AI readiness', () => {
  it('keeps AI-first unavailable until a configured provider passes a real session test', () => {
    expect(resolveAiReadiness([], new Set()).status).toBe('not-configured');
    expect(resolveAiReadiness([provider], new Set()).status).toBe('not-verified');
    expect(resolveAiReadiness([provider], new Set(['local']))).toMatchObject({
      status: 'ready',
      providerId: 'local',
    });
  });

  it('does not trust a verification marker for a removed provider', () => {
    expect(resolveAiReadiness([], new Set(['local'])).status).toBe('not-configured');
  });
});
