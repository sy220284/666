import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';

import type { ProviderConfig } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { createProviderAdapter } from '../../packages/core-service/src/provider-adapters.js';
import { ProviderConnectionService } from '../../packages/core-service/src/provider-connection.js';

const servers: ReturnType<typeof createServer>[] = [];
const now = '2026-07-25T01:00:00.000Z';

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  return JSON.parse(body) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function startProviderServer(options: { omitUsage?: boolean } = {}) {
  const server = createServer(async (request, response) => {
    const url = request.url ?? '';
    if (url.endsWith('/models')) {
      json(response, 200, {
        data: [{ id: url.includes('anthropic') ? 'claude-test' : 'writer-model' }],
      });
      return;
    }
    const body = await readBody(request);
    const stream = body.stream === true;
    const structured = 'response_format' in body || 'output_config' in body;
    if (!stream) {
      if (url.includes('anthropic')) {
        json(response, 200, {
          content: [{ type: 'text', text: structured ? '{"ok":true}' : 'OK' }],
        });
      } else {
        json(response, 200, {
          choices: [{ message: { content: structured ? '{"ok":true}' : 'OK' } }],
        });
      }
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    if (url.includes('anthropic')) {
      response.write(
        `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 2 } } })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: '好' } })}\n\n`,
      );
      if (!options.omitUsage) {
        response.write(
          `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 1 } })}\n\n`,
        );
      }
      response.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    } else {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: 'stop' }] })}\n\n`,
      );
      if (!options.omitUsage) {
        response.write(
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n\n`,
        );
      }
      response.write('data: [DONE]\n\n');
    }
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS_MISSING');
  return `http://127.0.0.1:${address.port}`;
}

function config(
  baseUrl: string,
  protocol: ProviderConfig['protocol'] = 'openai_compatible',
  model = protocol === 'anthropic' ? 'claude-test' : 'writer-model',
): ProviderConfig {
  return {
    id: `${protocol}-test`,
    name: '连接测试',
    protocol,
    baseUrl,
    model,
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe('M4-03 real Provider protocol adapters', () => {
  it('verifies OpenAI-compatible and Anthropic model, minimal generation, streaming, structured output, and usage', async () => {
    const root = await startProviderServer();
    const service = new ProviderConnectionService({ clock: { now: () => new Date(now) } });
    const openai = await service.test(config(`${root}/openai/v1`), null);
    expect(openai).toMatchObject({
      reachable: true,
      authentication: 'not-required',
      modelList: 'verified',
      actualModel: 'writer-model',
      streaming: true,
      structuredOutput: true,
      tokenUsageAvailable: true,
      endpoint: { scope: 'loopback' },
    });
    const anthropic = await service.test(
      config(`${root}/anthropic/v1`, 'anthropic', 'claude-test'),
      'anthropic-secret',
    );
    expect(anthropic).toMatchObject({
      authentication: 'verified',
      modelList: 'verified',
      streaming: true,
      structuredOutput: true,
      tokenUsageAvailable: true,
    });
    expect(JSON.stringify(anthropic)).not.toContain('anthropic-secret');
  });

  it('emits exactly one completion event when finish_reason and DONE are both present', async () => {
    const root = await startProviderServer();
    const adapter = createProviderAdapter(config(`${root}/openai/v1`), null);
    const events = [];
    for await (const event of adapter.generate(
      {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        model: 'writer-model',
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxOutputTokens: 8,
        metadata: {
          taskType: 'validate',
          promptId: 'test',
          promptVersion: 1,
          constraintHash: '0'.repeat(64),
        },
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events.filter((event) => event.type === 'completed')).toEqual([
      { type: 'completed', finishReason: 'stop' },
    ]);
  });

  it('keeps cancellation and timeout active after streaming response headers arrive', async () => {
    const stalledFetch = async (): Promise<Response> =>
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // The reader remains pending until the adapter deadline cancels it.
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    const request = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      model: 'writer-model',
      systemPrompt: 'test',
      messages: [{ role: 'user' as const, content: 'test' }],
      maxOutputTokens: 8,
      metadata: {
        taskType: 'validate' as const,
        promptId: 'test',
        promptVersion: 1,
        constraintHash: '0'.repeat(64),
      },
    };

    const cancelledController = new AbortController();
    const cancelledAdapter = createProviderAdapter(config('https://provider.example/v1'), null, {
      fetch: stalledFetch as typeof fetch,
    });
    const cancelledStream = cancelledAdapter.generate(request, cancelledController.signal);
    const cancelledIterator = cancelledStream[Symbol.asyncIterator]();
    await expect(cancelledIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    const cancelledRead = cancelledIterator.next();
    cancelledController.abort();
    await expect(cancelledRead).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    const timeoutAdapter = createProviderAdapter(
      { ...config('https://provider.example/v1'), timeoutMs: 1_000 },
      null,
      { fetch: stalledFetch as typeof fetch },
    );
    const timeoutStream = timeoutAdapter.generate(request, new AbortController().signal);
    const timeoutIterator = timeoutStream[Symbol.asyncIterator]();
    await expect(timeoutIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(timeoutIterator.next()).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });
  });

  it('reports missing usage without failing a valid stream', async () => {
    const root = await startProviderServer({ omitUsage: true });
    const result = await new ProviderConnectionService().test(config(`${root}/openai/v1`), null);
    expect(result.tokenUsageAvailable).toBe(false);
    expect(result.warnings.join(' ')).toContain('本地估算');
  });

  it('normalizes authentication, rate-limit, model, timeout, interruption, and cancellation failures', async () => {
    const external = config('https://provider.example/v1');
    const lookup = (async () => [{ address: '93.184.216.34', family: 4 }]) as never;
    const run = (response: Response | Promise<Response>) =>
      new ProviderConnectionService({ lookup, fetch: async () => response }).test(
        external,
        'secret',
      );
    await expect(run(new Response('', { status: 401 }))).rejects.toMatchObject({
      code: 'AI_AUTH_FAILED_004',
    });
    await expect(run(new Response('', { status: 429 }))).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED_005',
    });
    await expect(
      run(new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 })),
    ).rejects.toMatchObject({ code: 'AI_MODEL_UNSUPPORTED_010' });

    const timeoutFetch = async (_input: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    await expect(
      new ProviderConnectionService({ lookup, fetch: timeoutFetch as typeof fetch }).test(
        { ...external, timeoutMs: 1_000 },
        'secret',
      ),
    ).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });

    const root = await startProviderServer();
    const adapter = createProviderAdapter(config(`${root}/openai/v1`), null);
    const controller = new AbortController();
    controller.abort();
    const events = adapter.generate(
      {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        model: 'writer-model',
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxOutputTokens: 8,
        metadata: {
          taskType: 'validate',
          promptId: 'test',
          promptVersion: 1,
          constraintHash: '0'.repeat(64),
        },
      },
      controller.signal,
    );
    await expect(events.next()).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });
  });
});
