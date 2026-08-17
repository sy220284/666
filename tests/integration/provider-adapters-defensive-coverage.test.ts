import type { GenerationRequest, ProviderConfig, ProviderEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  createProviderAdapter,
  type AIProvider,
} from '../../packages/core-service/src/provider-adapters.js';

const now = '2026-08-17T00:00:00.000Z';

function config(
  protocol: ProviderConfig['protocol'] = 'openai_compatible',
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id: `${protocol}-defensive`,
    name: 'defensive coverage',
    protocol,
    baseUrl: 'https://provider.example/v1?stale=1#fragment',
    model: protocol === 'anthropic' ? 'claude-test' : 'writer-model',
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function generation(model: string): GenerationRequest {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440000',
    model,
    systemPrompt: 'defensive test',
    messages: [{ role: 'user', content: 'test' }],
    maxOutputTokens: 16,
    metadata: {
      taskType: 'validate',
      promptId: 'provider.defensive-coverage',
      promptVersion: 1,
      constraintHash: '0'.repeat(64),
    },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function cancellingResponse(status: number): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel() {
        return Promise.reject(new Error('synthetic body already closed'));
      },
    }),
    { status },
  );
}

function postedBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;
}

async function collect(provider: AIProvider, request: GenerationRequest): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.generate(request, new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

async function expectStreamFailure(status: number, code: string): Promise<void> {
  const provider = createProviderAdapter(config(), null, {
    fetch: async () => new Response(null, { status }),
  });
  const iterator = provider
    .generate(generation('writer-model'), new AbortController().signal)
    [Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
  await expect(iterator.next()).rejects.toMatchObject({ code });
}

describe('Provider adapter defensive coverage', () => {
  it('maps remaining HTTP failures and blocks redirects, network failures, empty streams and broken readers', async () => {
    await expectStreamFailure(403, 'AI_AUTH_FAILED_004');
    await expectStreamFailure(408, 'AI_REQUEST_TIMEOUT_006');
    await expectStreamFailure(500, 'AI_CONNECTION_FAILED_003');
    await expectStreamFailure(418, 'AI_CONNECTION_FAILED_003');

    const redirect = createProviderAdapter(config(), null, {
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://redirected.example/v1' },
        }),
    });
    await expect(
      redirect.generate(generation('writer-model'), new AbortController().signal).next(),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });

    const unreachable = createProviderAdapter(config(), null, {
      fetch: async () => {
        throw new Error('network unavailable');
      },
    });
    await expect(
      unreachable.generate(generation('writer-model'), new AbortController().signal).next(),
    ).rejects.toMatchObject({ code: 'AI_CONNECTION_FAILED_003' });

    const empty = createProviderAdapter(config(), null, {
      fetch: async () => new Response(null, { status: 200 }),
    });
    const emptyIterator = empty
      .generate(generation('writer-model'), new AbortController().signal)
      [Symbol.asyncIterator]();
    await expect(emptyIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(emptyIterator.next()).rejects.toMatchObject({ code: 'AI_STREAM_INTERRUPTED_009' });

    const broken = createProviderAdapter(config(), null, {
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              throw new Error('reader failed');
            },
          }),
          { status: 200 },
        ),
    });
    const brokenIterator = broken
      .generate(generation('writer-model'), new AbortController().signal)
      [Symbol.asyncIterator]();
    await expect(brokenIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(brokenIterator.next()).rejects.toMatchObject({ code: 'AI_STREAM_INTERRUPTED_009' });
  });

  it('reports OpenAI-compatible unsupported capabilities without leaking transport details', async () => {
    const seenUrls: string[] = [];
    const provider = createProviderAdapter(config(), 'openai-secret', {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        seenUrls.push(url.toString());
        expect(url.search).toBe('');
        expect(url.hash).toBe('');
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer openai-secret');

        if (url.pathname.endsWith('/models')) return cancellingResponse(404);
        const body = postedBody(init);
        if (body.stream === true) {
          return sse(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' } }] })}\n\ndata: [DONE]\n\n`);
        }
        if ('response_format' in body) return cancellingResponse(422);
        return json({ choices: [{ message: { content: 'OK' } }] });
      },
    });

    await expect(provider.testConnection()).resolves.toMatchObject({
      modelList: 'unsupported',
      structuredOutput: false,
      tokenUsageAvailable: false,
      warnings: [
        '该端点未提供可用的模型列表，已通过实际生成验证模型。',
        '该模型未通过JSON Schema结构化输出探测。',
        '该流未返回Token统计，后续将使用本地估算。',
      ],
    });
    expect(seenUrls.some((url) => url.endsWith('/v1/models'))).toBe(true);
  });

  it('covers OpenAI-compatible invalid JSON, empty text, trailing SSE and early stream termination', async () => {
    const invalidJsonProvider = createProviderAdapter(config(), null, {
      fetch: async () => new Response('{', { status: 200 }),
    });
    await expect(invalidJsonProvider.testConnection()).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID_008',
    });

    const noTextProvider = createProviderAdapter(config(), null, {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'writer-model' }] });
        return json({ choices: [{ message: { content: '' } }] });
      },
    });
    await expect(noTextProvider.testConnection()).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID_008',
    });

    const structuredInvalidProvider = createProviderAdapter(config(), null, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'writer-model' }] });
        const body = postedBody(init);
        if (body.stream === true) {
          return sse(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' } }] })}\n\ndata: [DONE]\n\n`);
        }
        return json({
          choices: [{ message: { content: 'response_format' in body ? 'not-json' : 'OK' } }],
        });
      },
    });
    await expect(structuredInvalidProvider.testConnection()).resolves.toMatchObject({
      modelList: 'verified',
      structuredOutput: false,
    });

    const trailing = createProviderAdapter(config(), null, {
      fetch: async () =>
        sse(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: '尾' }, finish_reason: 'length' }],
          })}`,
        ),
    });
    await expect(collect(trailing, generation('writer-model'))).resolves.toEqual([
      { type: 'connected' },
      { type: 'delta', text: '尾' },
      { type: 'completed', finishReason: 'length' },
    ]);

    const inputOnly = createProviderAdapter(config(), null, {
      fetch: async () =>
        sse(
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2 } })}\n\n` +
            `data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 3 } })}\n\n` +
            'data: [DONE]\n\n',
        ),
    });
    await expect(collect(inputOnly, generation('writer-model'))).resolves.toEqual([
      { type: 'connected' },
      { type: 'usage', inputTokens: 2 },
      { type: 'usage', outputTokens: 3 },
      { type: 'completed' },
    ]);

    const endedEarly = createProviderAdapter(config(), null, {
      fetch: async () => sse(': keepalive\n\n'),
    });
    await expect(collect(endedEarly, generation('writer-model'))).rejects.toMatchObject({
      code: 'AI_STREAM_INTERRUPTED_009',
    });
  });

  it('covers Anthropic unsupported probes, custom version headers and malformed probe responses', async () => {
    const provider = createProviderAdapter(
      config('anthropic', { options: { anthropicVersion: '2025-01-01' } }),
      null,
      {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          expect(new Headers(init?.headers).get('anthropic-version')).toBe('2025-01-01');
          if (url.pathname.endsWith('/models')) return json({ data: [] });
          const body = postedBody(init);
          if (body.stream === true) {
            return sse(
              `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: '好' } })}\n\n` +
                `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
            );
          }
          if ('output_config' in body) return cancellingResponse(400);
          return json({ content: [{ type: 'text', text: 'OK' }] });
        },
      },
    );
    await expect(provider.testConnection()).resolves.toMatchObject({
      modelList: 'unsupported',
      structuredOutput: false,
      tokenUsageAvailable: false,
      warnings: [
        '该端点未提供可用的模型列表，已通过实际生成验证模型。',
        '该模型未通过结构化输出探测。',
        '该流未返回Token统计，后续将使用本地估算。',
      ],
    });

    const wrongModel = createProviderAdapter(config('anthropic'), null, {
      fetch: async () => json({ data: [{ id: 'other-model' }] }),
    });
    await expect(wrongModel.testConnection()).rejects.toMatchObject({
      code: 'AI_MODEL_UNSUPPORTED_010',
    });

    const noText = createProviderAdapter(config('anthropic'), null, {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'claude-test' }] });
        return json({ content: [{ type: 'text', text: '' }] });
      },
    });
    await expect(noText.testConnection()).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID_008' });
  });

  it('covers Anthropic error events, ignored wire values and incomplete streams', async () => {
    const errorProvider = createProviderAdapter(config('anthropic'), null, {
      fetch: async () => sse(`data: ${JSON.stringify({ type: 'error' })}\n\n`),
    });
    const errorIterator = errorProvider
      .generate(generation('claude-test'), new AbortController().signal)
      [Symbol.asyncIterator]();
    await expect(errorIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(errorIterator.next()).rejects.toMatchObject({
      code: 'AI_CONNECTION_FAILED_003',
      retryable: true,
    });

    const incomplete = createProviderAdapter(config('anthropic'), null, {
      fetch: async () =>
        sse(
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 42 } })}\n\n` +
            `data: ${JSON.stringify({
              type: 'message_start',
              message: { usage: { input_tokens: -1, output_tokens: '3' } },
            })}\n\n`,
        ),
    });
    await expect(collect(incomplete, generation('claude-test'))).rejects.toMatchObject({
      code: 'AI_STREAM_INTERRUPTED_009',
    });
  });

  it('propagates cancellation from connection probing into the active streaming request', async () => {
    const controller = new AbortController();
    let markStreaming: (() => void) | undefined;
    const streamingStarted = new Promise<void>((resolve) => {
      markStreaming = resolve;
    });
    const provider = createProviderAdapter(config(), null, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'writer-model' }] });
        const body = postedBody(init);
        if (body.stream !== true) return json({ choices: [{ message: { content: 'OK' } }] });
        markStreaming?.();
        return new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Keep the read pending until the external probe signal cancels the stream.
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      },
    });

    const pending = provider.testConnection(controller.signal);
    await streamingStarted;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });
  });
});
