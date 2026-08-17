import type { GenerationRequest, ProviderConfig } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { createProviderAdapter } from '../../packages/core-service/src/provider-adapters.js';
import { ProviderRuntimeError } from '../../packages/core-service/src/provider-errors.js';

const now = '2026-08-17T00:00:00.000Z';

function config(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openai-tail',
    name: 'tail coverage',
    protocol: 'openai_compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'writer-model',
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function generation(): GenerationRequest {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440000',
    model: 'writer-model',
    systemPrompt: 'tail coverage',
    messages: [{ role: 'user', content: 'test' }],
    maxOutputTokens: 16,
    metadata: {
      taskType: 'validate',
      promptId: 'provider.tail-coverage',
      promptVersion: 1,
      constraintHash: '0'.repeat(64),
    },
  };
}

function iterator(
  provider: ReturnType<typeof createProviderAdapter>,
  signal: AbortSignal = new AbortController().signal,
) {
  return provider.generate(generation(), signal)[Symbol.asyncIterator]();
}

describe('Provider adapter tail coverage', () => {
  it('keeps an already normalized base path and reports JSON body timeouts', async () => {
    const normalized = createProviderAdapter(
      config({ baseUrl: 'https://provider.example/v1/' }),
      null,
      {
        fetch: async (input) => {
          expect(new URL(String(input)).pathname).toBe('/v1/chat/completions');
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        },
      },
    );
    const normalizedIterator = iterator(normalized);
    await expect(normalizedIterator.next()).resolves.toMatchObject({
      value: { type: 'connected' },
    });
    await expect(normalizedIterator.next()).resolves.toMatchObject({
      value: { type: 'completed' },
    });

    const bodyTimeout = createProviderAdapter(config({ timeoutMs: 10 }), null, {
      fetch: async (_input, init) => {
        const response = new Response('', { status: 200 });
        Object.defineProperty(response, 'text', {
          value: () =>
            new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('aborted', 'AbortError')),
                { once: true },
              );
            }),
        });
        return response;
      },
    });
    await expect(bodyTimeout.testConnection()).rejects.toMatchObject({
      code: 'AI_REQUEST_TIMEOUT_006',
    });
  });

  it('maps cancellation at the next SSE loop boundary', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const provider = createProviderAdapter(config(), null, {
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              streamController.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: '片' } }] })}\n\n`,
                ),
              );
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const stream = iterator(provider, controller.signal);
    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'delta', text: '片' } });
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });
  });

  it('maps timeout failures raised while a stream read is pending', async () => {
    const provider = createProviderAdapter(config({ timeoutMs: 10 }), null, {
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              init?.signal?.addEventListener(
                'abort',
                () => streamController.error(new DOMException('aborted', 'AbortError')),
                { once: true },
              );
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const stream = iterator(provider);
    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(stream.next()).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });
  });

  it('preserves ProviderRuntimeError values thrown by the stream reader', async () => {
    const provider = createProviderAdapter(config(), null, {
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              throw new ProviderRuntimeError(
                'AI_CONNECTION_FAILED_003',
                'Synthetic mapped stream failure.',
                true,
              );
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const stream = iterator(provider);
    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(stream.next()).rejects.toMatchObject({
      code: 'AI_CONNECTION_FAILED_003',
      retryable: true,
    });
  });
});
