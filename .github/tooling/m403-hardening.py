from pathlib import Path
import subprocess


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    target.write_text(text.replace(old, new, 1))


write(
    'packages/core-service/src/provider-endpoint.ts',
    r'''import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  ProviderBaseUrlSchema,
  ProviderEndpointInfoSchema,
  type ProviderEndpointInfo,
  type ProviderEndpointScope,
} from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export type ProviderDnsLookup = typeof systemLookup;

type EndpointScope = ProviderEndpointScope | 'unsafe';

function unsafe(message: string): never {
  throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', message, false);
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '').toLowerCase();
}

function ipv4Parts(host: string): [number, number, number, number] | null {
  const parts = host.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function ipv4Scope(host: string): EndpointScope {
  const parts = ipv4Parts(host);
  if (!parts) return 'unsafe';
  const [a, b, c] = parts;
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return 'lan';
  }
  if (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) {
    return 'unsafe';
  }
  return 'external';
}

function parseIpv6Words(host: string): readonly number[] | null {
  const pieces = host.split('::');
  if (pieces.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const tokens = side.split(':');
    const words: number[] = [];
    for (const token of tokens) {
      if (token.includes('.')) {
        const ipv4 = ipv4Parts(token);
        if (!ipv4) return null;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/iu.test(token)) return null;
      words.push(Number.parseInt(token, 16));
    }
    return words;
  };

  const left = parseSide(pieces[0] ?? '');
  const right = parseSide(pieces[1] ?? '');
  if (!left || !right) return null;
  if (pieces.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv6Scope(host: string): EndpointScope {
  const words = parseIpv6Words(host);
  if (!words || words.length !== 8) return 'unsafe';
  const allZero = words.every((word) => word === 0);
  if (allZero) return 'unsafe';
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return 'loopback';

  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  if (mapped || compatible) {
    const ipv4 = `${(words[6]! >> 8) & 0xff}.${words[6]! & 0xff}.${
      (words[7]! >> 8) & 0xff
    }.${words[7]! & 0xff}`;
    return ipv4Scope(ipv4);
  }

  const first = words[0]!;
  if ((first & 0xfe00) === 0xfc00) return 'lan';
  if ((first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return 'unsafe';
  if (first === 0x2001 && words[1] === 0x0db8) return 'unsafe';
  return 'external';
}

function literalScope(hostname: string): EndpointScope | null {
  const host = normalizedHost(hostname);
  const version = isIP(host);
  if (version === 4) return ipv4Scope(host);
  if (version === 6) return ipv6Scope(host);
  return null;
}

function hostnameScope(hostname: string): ProviderEndpointScope {
  const host = normalizedHost(hostname);
  const literal = literalScope(host);
  if (literal === 'unsafe') unsafe('The Provider endpoint uses a blocked or non-routable address.');
  if (literal) return literal;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host.endsWith('.local')) return 'lan';
  if (host === 'metadata.google.internal') {
    unsafe('The Provider endpoint targets a blocked instance metadata host.');
  }
  return 'external';
}

function endpointWarnings(scope: ProviderEndpointScope, secureTransport: boolean): string[] {
  const warnings =
    scope === 'loopback'
      ? ['请求仅发送到当前设备上的用户配置服务。']
      : scope === 'lan'
        ? ['项目内容将发送到局域网设备，请确认该设备可信。']
        : ['项目内容将通过HTTPS发送到外部Provider。'];
  if (!secureTransport) warnings.push('当前连接未使用TLS，仅允许本机或受信局域网端点。');
  return warnings;
}

export function validateProviderEndpoint(baseUrl: string): ProviderEndpointInfo {
  const parsedValue = ProviderBaseUrlSchema.safeParse(baseUrl);
  if (!parsedValue.success) unsafe('The Provider URL is invalid or contains embedded credentials.');
  const url = new URL(parsedValue.data);
  if (url.search || url.hash) {
    unsafe('Provider Base URLs cannot contain query parameters or fragments.');
  }
  if (url.port === '0') unsafe('The Provider endpoint cannot use port 0.');
  const scope = hostnameScope(url.hostname);
  const secureTransport = url.protocol === 'https:';
  if (scope === 'external' && !secureTransport) {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope,
    origin: url.origin,
    secureTransport,
    warnings: endpointWarnings(scope, secureTransport),
  });
}

export async function inspectProviderEndpoint(
  baseUrl: string,
  lookup: ProviderDnsLookup = systemLookup,
): Promise<ProviderEndpointInfo> {
  const initial = validateProviderEndpoint(baseUrl);
  const url = new URL(baseUrl);
  const host = normalizedHost(url.hostname);
  if (
    literalScope(host) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return initial;
  }
  let addresses: readonly { readonly address: string; readonly family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname could not be resolved.',
      true,
    );
  }
  if (addresses.length === 0) {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname has no address.',
      true,
    );
  }
  const scopes = new Set<ProviderEndpointScope>();
  for (const address of addresses) {
    const scope = literalScope(address.address);
    if (!scope || scope === 'unsafe') {
      unsafe('The Provider hostname resolved to an unsafe address.');
    }
    scopes.add(scope);
  }
  if (scopes.size !== 1) {
    unsafe('The Provider hostname resolved across mixed network trust boundaries.');
  }
  const [resolvedScope] = scopes;
  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');
  if (resolvedScope === 'external' && url.protocol !== 'https:') {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope: resolvedScope,
    origin: url.origin,
    secureTransport: url.protocol === 'https:',
    warnings: endpointWarnings(resolvedScope, url.protocol === 'https:'),
  });
}
''',
)

adapters_path = Path('packages/core-service/src/provider-adapters.ts')
adapters = adapters_path.read_text()
start = adapters.index('function endpoint(')
end = adapters.index('function connectionRequest(', start)
replacement = r'''function endpoint(baseUrl: string, relative: string): URL {
  const normalized = new URL(baseUrl);
  normalized.search = '';
  normalized.hash = '';
  if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
  return new URL(relative, normalized);
}

function mapHttpError(status: number): ProviderRuntimeError {
  if (status === 401 || status === 403) {
    return new ProviderRuntimeError('AI_AUTH_FAILED_004', 'Provider authentication failed.', false);
  }
  if (status === 429) {
    return new ProviderRuntimeError('AI_RATE_LIMITED_005', 'The Provider rate limit was reached.', true);
  }
  if (status === 408 || status === 504) {
    return new ProviderRuntimeError('AI_REQUEST_TIMEOUT_006', 'The Provider request timed out.', true);
  }
  if (status >= 500) {
    return new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider is temporarily unavailable.',
      true,
    );
  }
  return new ProviderRuntimeError(
    'AI_CONNECTION_FAILED_003',
    'The Provider rejected the request.',
    false,
  );
}

interface ProviderResponseLease {
  readonly response: Response;
  readonly signal: AbortSignal;
  readonly cancelled: () => boolean;
  readonly timedOut: () => boolean;
  readonly release: () => void;
}

function cancelledError(): ProviderRuntimeError {
  return new ProviderRuntimeError(
    'COMMON_CANCELLED_004',
    'The Provider request was cancelled.',
    false,
  );
}

function timeoutError(): ProviderRuntimeError {
  return new ProviderRuntimeError('AI_REQUEST_TIMEOUT_006', 'The Provider request timed out.', true);
}

function deadlineError(lease: ProviderResponseLease): ProviderRuntimeError | null {
  if (lease.cancelled()) return cancelledError();
  if (lease.timedOut()) return timeoutError();
  return null;
}

async function request(
  fetchImplementation: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<ProviderResponseLease> {
  if (userSignal?.aborted) throw cancelledError();
  const controller = new AbortController();
  let cancelled = false;
  let timedOut = false;
  let released = false;
  const onAbort = (): void => {
    cancelled = true;
    controller.abort();
  };
  userSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const release = (): void => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    userSignal?.removeEventListener('abort', onAbort);
  };

  try {
    const response = await fetchImplementation(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      try {
        await response.body?.cancel();
      } finally {
        release();
      }
      throw new ProviderRuntimeError(
        'AI_ENDPOINT_UNSAFE_013',
        'Provider redirects are blocked unless an adapter explicitly approves them.',
        false,
      );
    }
    return {
      response,
      signal: controller.signal,
      cancelled: () => cancelled,
      timedOut: () => timedOut,
      release,
    };
  } catch (error) {
    release();
    if (error instanceof ProviderRuntimeError) throw error;
    if (cancelled) throw cancelledError();
    if (timedOut) throw timeoutError();
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider could not be reached.',
      true,
    );
  }
}

async function discard(lease: ProviderResponseLease): Promise<void> {
  try {
    await lease.response.body?.cancel();
  } catch {
    // The body may already be closed by the runtime.
  } finally {
    lease.release();
  }
}

async function requireJson(lease: ProviderResponseLease): Promise<unknown> {
  if (!lease.response.ok) {
    const error = mapHttpError(lease.response.status);
    await discard(lease);
    throw error;
  }
  try {
    const text = await lease.response.text();
    return JSON.parse(text) as unknown;
  } catch (error) {
    const deadline = deadlineError(lease);
    if (deadline) throw deadline;
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError(
      'AI_OUTPUT_INVALID_008',
      'The Provider returned invalid JSON.',
      false,
    );
  } finally {
    lease.release();
  }
}

async function* sseData(lease: ProviderResponseLease): AsyncGenerator<string> {
  if (!lease.response.ok) {
    const error = mapHttpError(lease.response.status);
    await discard(lease);
    throw error;
  }
  if (!lease.response.body) {
    lease.release();
    throw new ProviderRuntimeError(
      'AI_STREAM_INTERRUPTED_009',
      'The Provider stream was empty.',
      true,
    );
  }
  const reader = lease.response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (lease.signal.aborted) throw deadlineError(lease) ?? cancelledError();
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/u);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const data = event
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const data = buffer
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  } catch (error) {
    const deadline = deadlineError(lease);
    if (deadline) throw deadline;
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError(
      'AI_STREAM_INTERRUPTED_009',
      'The Provider stream was interrupted.',
      true,
    );
  } finally {
    reader.releaseLock();
    lease.release();
  }
}

'''
adapters = adapters[:start] + replacement + adapters[end:]
tail_start = adapters.index('function connectionRequest(')
prefix = adapters[:tail_start]
tail = adapters[tail_start:]
tail = tail.replace('response.status', 'response.response.status')
tail = tail.replace('sseData(response, signal)', 'sseData(response)')
unsupported = "if ([404, 405, 501].includes(response.response.status)) return 'unsupported';"
if tail.count(unsupported) != 2:
    raise SystemExit(f'model unsupported response target count: {tail.count(unsupported)}')
tail = tail.replace(
    unsupported,
    """if ([404, 405, 501].includes(response.response.status)) {
      await discard(response);
      return 'unsupported';
    }""",
)
structured = "if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) return false;"
if tail.count(structured) != 2:
    raise SystemExit(f'structured unsupported response target count: {tail.count(structured)}')
tail = tail.replace(
    structured,
    """if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) {
      await discard(response);
      return false;
    }""",
)
adapters = prefix + tail
old_openai = r'''    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    for await (const data of sseData(response)) {
      if (data === '[DONE]') {
        completed = true;
        yield ProviderEventSchema.parse({ type: 'completed' });
        break;
      }
      let payload: JsonRecord | null;
      try {
        payload = object(JSON.parse(data));
      } catch {
        throw new ProviderRuntimeError(
          'AI_OUTPUT_INVALID_008',
          'The Provider stream contained invalid JSON.',
          false,
        );
      }
      const choice = object(array(payload?.choices)[0]);
      const text = string(object(choice?.delta)?.content);
      if (text) yield ProviderEventSchema.parse({ type: 'delta', text });
      const usage = object(payload?.usage);
      const inputTokens = integer(usage?.prompt_tokens);
      const outputTokens = integer(usage?.completion_tokens);
      if (inputTokens !== undefined || outputTokens !== undefined) {
        yield ProviderEventSchema.parse({
          type: 'usage',
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
        });
      }
      if (choice?.finish_reason) {
        completed = true;
        yield ProviderEventSchema.parse({
          type: 'completed',
          finishReason: String(choice.finish_reason),
        });
      }
    }
    if (!completed) {
      throw new ProviderRuntimeError(
        'AI_STREAM_INTERRUPTED_009',
        'The Provider stream ended early.',
        true,
      );
    }
'''
new_openai = r'''    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    let finishReason: string | undefined;
    for await (const data of sseData(response)) {
      if (data === '[DONE]') {
        completed = true;
        yield ProviderEventSchema.parse({
          type: 'completed',
          ...(finishReason ? { finishReason } : {}),
        });
        break;
      }
      let payload: JsonRecord | null;
      try {
        payload = object(JSON.parse(data));
      } catch {
        throw new ProviderRuntimeError(
          'AI_OUTPUT_INVALID_008',
          'The Provider stream contained invalid JSON.',
          false,
        );
      }
      const choice = object(array(payload?.choices)[0]);
      const text = string(object(choice?.delta)?.content);
      if (text) yield ProviderEventSchema.parse({ type: 'delta', text });
      const usage = object(payload?.usage);
      const inputTokens = integer(usage?.prompt_tokens);
      const outputTokens = integer(usage?.completion_tokens);
      if (inputTokens !== undefined || outputTokens !== undefined) {
        yield ProviderEventSchema.parse({
          type: 'usage',
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
        });
      }
      if (choice?.finish_reason) finishReason = String(choice.finish_reason);
    }
    if (!completed && finishReason) {
      completed = true;
      yield ProviderEventSchema.parse({ type: 'completed', finishReason });
    }
    if (!completed) {
      throw new ProviderRuntimeError(
        'AI_STREAM_INTERRUPTED_009',
        'The Provider stream ended early.',
        true,
      );
    }
'''
if adapters.count(old_openai) != 1:
    raise SystemExit(f'openai completion block target count: {adapters.count(old_openai)}')
adapters_path.write_text(adapters.replace(old_openai, new_openai, 1))

write(
    'tests/security/provider-endpoint.test.ts',
    r'''import { describe, expect, it } from 'vitest';

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
    expect(validateProviderEndpoint('http://[::ffff:192.168.1.20]:8080/v1')).toMatchObject({
      scope: 'lan',
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
      'http://[::ffff:127.0.0.1]:8080/v1',
    ];
    for (const endpoint of blocked) {
      expect(codeOf(() => validateProviderEndpoint(endpoint)), endpoint).toBe(
        'AI_ENDPOINT_UNSAFE_013',
      );
    }
  });

  it('blocks DNS answers that cross trust boundaries or resolve into unsafe ranges', async () => {
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [{ address: '::ffff:127.0.0.1', family: 6 }]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
});
''',
)

integration_path = Path('tests/integration/provider-connection.test.ts')
integration = integration_path.read_text()
old_chunk = """      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: null }] })}\\n\\n`);
"""
new_chunk = """      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: 'stop' }] })}\\n\\n`);
"""
if integration.count(old_chunk) != 1:
    raise SystemExit(f'openai fixture finish target count: {integration.count(old_chunk)}')
integration = integration.replace(old_chunk, new_chunk, 1)
insert_before = """  it('reports missing usage without failing a valid stream', async () => {
"""
new_tests = r'''  it('emits exactly one completion event when finish_reason and DONE are both present', async () => {
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
            // Hold the body open until AbortController or deadline cancels the fetch body.
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
    const cancelledIterator = createProviderAdapter(config('https://provider.example/v1'), null, {
      fetch: stalledFetch as typeof fetch,
    })
      .generate(request, cancelledController.signal)
      [Symbol.asyncIterator]();
    await expect(cancelledIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    const cancelledRead = cancelledIterator.next();
    cancelledController.abort();
    await expect(cancelledRead).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    const timeoutIterator = createProviderAdapter(
      { ...config('https://provider.example/v1'), timeoutMs: 1_000 },
      null,
      { fetch: stalledFetch as typeof fetch },
    )
      .generate(request, new AbortController().signal)
      [Symbol.asyncIterator]();
    await expect(timeoutIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(timeoutIterator.next()).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });
  });

'''
if integration.count(insert_before) != 1:
    raise SystemExit(f'integration insertion target count: {integration.count(insert_before)}')
integration_path.write_text(integration.replace(insert_before, new_tests + insert_before, 1))

files = [
    'packages/core-service/src/provider-endpoint.ts',
    'packages/core-service/src/provider-adapters.ts',
    'tests/security/provider-endpoint.test.ts',
    'tests/integration/provider-connection.test.ts',
]
subprocess.run(['pnpm', 'exec', 'prettier', '--write', *files], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run(
    [
        'pnpm',
        'exec',
        'vitest',
        'run',
        'tests/unit/provider-contracts.test.ts',
        'tests/security/provider-endpoint.test.ts',
        'tests/security/provider-ipc.test.ts',
        'tests/integration/provider-connection.test.ts',
    ],
    check=True,
)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'build'], check=True)
subprocess.run(
    [
        'xvfb-run',
        '--auto-servernum',
        'pnpm',
        'exec',
        'playwright',
        'test',
        'provider-settings.spec.ts',
        '--config=tests/e2e/playwright.config.ts',
    ],
    check=True,
)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '修复：加固Provider端点取消与流式协议'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:work/m4-03-provider-credential-connection'], check=True)
