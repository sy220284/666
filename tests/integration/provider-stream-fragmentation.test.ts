import type { GenerationRequest, ProviderConfig, ProviderEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { createProviderAdapter } from '../../packages/core-service/src/provider-adapters.js';

const now = '2026-08-14T00:00:00.000Z';

function config(protocol: ProviderConfig['protocol']): ProviderConfig {
  return {
    id: `${protocol}-fragmentation`,
    name: 'fragmentation',
    protocol,
    baseUrl: 'https://provider.example/v1',
    model: protocol === 'anthropic' ? 'claude-test' : 'writer-model',
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: now,
    updatedAt: now,
  };
}

function request(model: string): GenerationRequest {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440000',
    model,
    systemPrompt: 'test',
    messages: [{ role: 'user', content: 'test' }],
    maxOutputTokens: 16,
    metadata: {
      taskType: 'validate',
      promptId: 'provider.fragmentation',
      promptVersion: 1,
      constraintHash: '0'.repeat(64),
    },
  };
}

function fragmentedResponse(payload: string, cuts: readonly number[]): Response {
  const encoded = new TextEncoder().encode(payload);
  const boundaries = [0, ...cuts.filter((cut) => cut > 0 && cut < encoded.length), encoded.length];
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < boundaries.length - 1; index += 1) {
          controller.enqueue(encoded.slice(boundaries[index], boundaries[index + 1]));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

async function collect(
  protocol: ProviderConfig['protocol'],
  payload: string,
  cuts: readonly number[],
): Promise<ProviderEvent[]> {
  const providerConfig = config(protocol);
  const adapter = createProviderAdapter(providerConfig, null, {
    fetch: async () => fragmentedResponse(payload, cuts),
  });
  const events: ProviderEvent[] = [];
  for await (const event of adapter.generate(
    request(providerConfig.model),
    new AbortController().signal,
  )) {
    events.push(event);
  }
  return events;
}

describe('Provider SSE fragmentation hardening', () => {
  it('reassembles OpenAI-compatible events across UTF-8 bytes, data prefix, CRLF delimiter and DONE boundaries', async () => {
    const payload = [
      `data: ${JSON.stringify({
        choices: [{ delta: { content: '好' }, finish_reason: 'stop' }],
      })}\r\n\r\n`,
      `data: ${JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 2, completion_tokens: 1 },
      })}\r\n\r\n`,
      'data: [DONE]\r\n\r\n',
    ].join('');
    const encoded = new TextEncoder().encode(payload);
    const chineseStart = encoded.findIndex((value) => value === 0xe5);
    const doneStart = payload.indexOf('[DONE]');

    const events = await collect('openai_compatible', payload, [
      1,
      4,
      7,
      chineseStart + 1,
      chineseStart + 2,
      Math.floor(encoded.length / 2),
      doneStart + 1,
      doneStart + 4,
      encoded.length - 3,
      encoded.length - 1,
    ]);

    expect(events).toEqual([
      { type: 'connected' },
      { type: 'delta', text: '好' },
      { type: 'usage', inputTokens: 2, outputTokens: 1 },
      { type: 'completed', finishReason: 'stop' },
    ]);
  });

  it('reassembles Anthropic events across arbitrary network chunks', async () => {
    const payload = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 3 } } })}\n\n`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: '长篇' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 2 } })}\n\n`,
      `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ].join('');
    const encoded = new TextEncoder().encode(payload);

    const events = await collect('anthropic', payload, [
      2,
      5,
      11,
      17,
      31,
      47,
      71,
      103,
      131,
      173,
      encoded.length - 1,
    ]);

    expect(events).toEqual([
      { type: 'connected' },
      { type: 'usage', inputTokens: 3 },
      { type: 'delta', text: '长篇' },
      { type: 'usage', outputTokens: 2 },
      { type: 'completed' },
    ]);
  });

  it('rejects invalid JSON while tolerating unknown nested wire fields without leaking undefined events', async () => {
    const invalidJson = 'data: {not-json}\n\n';
    await expect(collect('openai_compatible', invalidJson, [1, 3, 8])).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID_008',
    });

    const defensivePayload = [
      `data: ${JSON.stringify({
        choices: [
          {
            delta: { content: 42 },
            finish_reason: 'stop',
            extra: { nested: true },
          },
        ],
        usage: { prompt_tokens: '2', completion_tokens: -1 },
        ignored: ['future-provider-field'],
      })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    const events = await collect('openai_compatible', defensivePayload, [4, 9, 15, 27]);

    expect(events).toEqual([{ type: 'connected' }, { type: 'completed', finishReason: 'stop' }]);
  });
});
