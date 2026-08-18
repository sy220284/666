import type { GenerationRequest, ProviderConfig, ProviderEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { createProviderAdapter } from '../../packages/core-service/src/provider-adapters.js';

const now = '2026-08-17T00:00:00.000Z';

function config(
  protocol: ProviderConfig['protocol'] = 'openai_compatible',
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id: `${protocol}-edge`,
    name: 'edge coverage',
    protocol,
    baseUrl: 'https://provider.example/v1',
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
    systemPrompt: 'edge test',
    messages: [{ role: 'user', content: 'test' }],
    maxOutputTokens: 16,
    metadata: {
      taskType: 'validate',
      promptId: 'provider.edge-coverage',
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

async function collect(
  provider: ReturnType<typeof createProviderAdapter>,
  request: GenerationRequest,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.generate(request, new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

function eventIterator(
  provider: ReturnType<typeof createProviderAdapter>,
  request: GenerationRequest,
  signal: AbortSignal = new AbortController().signal,
) {
  return provider.generate(request, signal)[Symbol.asyncIterator]();
}

describe('Provider adapter remaining edge coverage', () => {
  it('maps cancellation and timeout after requests and response headers are already active', async () => {
    const requestController = new AbortController();
    const requestPending = createProviderAdapter(config(), null, {
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    }).testConnection(requestController.signal);
    requestController.abort();
    await expect(requestPending).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    let markBodyRead: (() => void) | undefined;
    const bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve;
    });
    const bodyController = new AbortController();
    const bodyPending = createProviderAdapter(config(), null, {
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
            pull() {
              markBodyRead?.();
            },
          }),
          { status: 200 },
        ),
    }).testConnection(bodyController.signal);
    await bodyRead;
    bodyController.abort();
    await expect(bodyPending).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    const timeoutPending = createProviderAdapter(
      config('openai_compatible', { timeoutMs: 10 }),
      null,
      {
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
            { status: 200 },
          ),
      },
    ).testConnection();
    await expect(timeoutPending).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });
  });

  it('covers a rejecting stream cancellation and an empty completed streaming probe', async () => {
    const streamController = new AbortController();
    const cancellable = createProviderAdapter(config(), null, {
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Keep the read pending until cancellation.
            },
            cancel() {
              return Promise.reject(new Error('synthetic cancellation failure'));
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const iterator = eventIterator(
      cancellable,
      generation('writer-model'),
      streamController.signal,
    );
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    const pendingRead = iterator.next();
    streamController.abort();
    await expect(pendingRead).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    const emptyProbe = createProviderAdapter(config(), null, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'writer-model' }] });
        const body = postedBody(init);
        if (body.stream === true) return sse('data: [DONE]\n\n');
        return json({ choices: [{ message: { content: 'OK' } }] });
      },
    });
    await expect(emptyProbe.testConnection()).rejects.toMatchObject({
      code: 'AI_STREAM_INTERRUPTED_009',
    });
  });

  it('covers empty OpenAI metadata, fractional usage and structured generation payloads', async () => {
    const emptyModels = createProviderAdapter(config(), null, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return json(null);
        const body = postedBody(init);
        if (body.stream === true) {
          return sse(
            `data: ${JSON.stringify({ choices: [{ delta: { content: '好' } }] })}\n\n` +
              'data: [DONE]\n\n',
          );
        }
        return json({ choices: [{ message: { content: '{"ok":true}' } }] });
      },
    });
    await expect(emptyModels.testConnection()).resolves.toMatchObject({
      modelList: 'unsupported',
      structuredOutput: true,
    });

    const fractionalUsage = createProviderAdapter(config(), null, {
      fetch: async () =>
        sse(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: '数' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1.5, completion_tokens: 0 },
          })}\n\n` + 'data: [DONE]\n\n',
        ),
    });
    await expect(collect(fractionalUsage, generation('writer-model'))).resolves.toEqual([
      { type: 'connected' },
      { type: 'delta', text: '数' },
      { type: 'usage', outputTokens: 0 },
      { type: 'completed', finishReason: 'stop' },
    ]);

    let structuredBody: Record<string, unknown> | undefined;
    const structured = createProviderAdapter(config(), null, {
      fetch: async (_input, init) => {
        structuredBody = postedBody(init);
        return sse('data: [DONE]\n\n');
      },
    });
    const structuredRequest: GenerationRequest = {
      ...generation('writer-model'),
      temperature: 0,
      structuredOutput: {
        name: 'defensive_schema',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
      },
    };
    await expect(collect(structured, structuredRequest)).resolves.toEqual([
      { type: 'connected' },
      { type: 'completed' },
    ]);
    expect(structuredBody).toMatchObject({
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'defensive_schema', strict: true },
      },
    });
  });

  it('covers Anthropic status fallback, invalid structured JSON and invalid stream JSON', async () => {
    const fallback = createProviderAdapter(config('anthropic'), null, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/models')) return cancellingResponse(405);
        const body = postedBody(init);
        if (body.stream === true) {
          return sse(
            `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: '好' } })}\n\n` +
              `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
          );
        }
        if ('output_config' in body) {
          return json({ content: [{ type: 'text', text: 'not-json' }] });
        }
        return json({ content: [{ type: 'text', text: 'OK' }] });
      },
    });
    await expect(fallback.testConnection()).resolves.toMatchObject({
      modelList: 'unsupported',
      structuredOutput: false,
    });

    const invalidStream = createProviderAdapter(config('anthropic'), null, {
      fetch: async () => sse('data: {not-json}\n\n'),
    });
    const iterator = eventIterator(invalidStream, generation('claude-test'));
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID_008' });
  });

  it('rejects a runtime protocol value without an approved adapter', () => {
    const unsupported = config();
    Object.defineProperty(unsupported, 'protocol', { value: 'unsupported_protocol' });
    expect(() => createProviderAdapter(unsupported, null)).toThrow(
      'No approved custom Provider adapter is registered.',
    );
  });
});
