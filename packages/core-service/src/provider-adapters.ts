import type { GenerationRequest, ProviderConfig, ProviderEvent } from '@worldforge/contracts';
import { GenerationRequestSchema, ProviderEventSchema } from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export interface ProviderAdapterProbeResult {
  readonly modelList: 'verified' | 'unsupported';
  readonly actualModel: string;
  readonly streaming: boolean;
  readonly structuredOutput: boolean;
  readonly tokenUsageAvailable: boolean;
  readonly warnings: readonly string[];
}

export interface AIProvider {
  readonly protocol: ProviderProtocol;
  testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export interface ProviderAdapterDependencies {
  readonly fetch?: typeof fetch;
}

type ProviderProtocol = ProviderConfig['protocol'];
type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function endpoint(baseUrl: string, relative: string): URL {
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
    return new ProviderRuntimeError(
      'AI_RATE_LIMITED_005',
      'The Provider rate limit was reached.',
      true,
    );
  }
  if (status === 408 || status === 504) {
    return new ProviderRuntimeError(
      'AI_REQUEST_TIMEOUT_006',
      'The Provider request timed out.',
      true,
    );
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
  return new ProviderRuntimeError(
    'AI_REQUEST_TIMEOUT_006',
    'The Provider request timed out.',
    true,
  );
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
    const value = await lease.response.text();
    return JSON.parse(value) as unknown;
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
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  lease.signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (lease.signal.aborted) throw deadlineError(lease)!;
      const chunk = await reader.read();
      if (chunk.done) {
        const deadline = deadlineError(lease);
        if (deadline) throw deadline;
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/u);
      buffer = events.pop()!;
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
    lease.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
    lease.release();
  }
}

function connectionRequest(model: string, structuredOutput = false): GenerationRequest {
  return GenerationRequestSchema.parse({
    runId: '550e8400-e29b-41d4-a716-446655440000',
    model,
    systemPrompt: 'WorldForge connection test.',
    messages: [{ role: 'user', content: structuredOutput ? 'Return {"ok":true}.' : 'Reply OK.' }],
    maxOutputTokens: 16,
    temperature: 0,
    ...(structuredOutput
      ? {
          structuredOutput: {
            name: 'worldforge_connection_test',
            schema: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
              additionalProperties: false,
            },
          },
        }
      : {}),
    metadata: {
      taskType: 'validate',
      promptId: 'provider.connection-test',
      promptVersion: 1,
      constraintHash: '0'.repeat(64),
    },
  });
}

abstract class BaseProvider implements AIProvider {
  abstract readonly protocol: ProviderProtocol;
  protected readonly config: ProviderConfig;
  protected readonly credential: string | null;
  protected readonly fetchImplementation: typeof fetch;

  constructor(
    config: ProviderConfig,
    credential: string | null,
    dependencies: ProviderAdapterDependencies,
  ) {
    this.config = config;
    this.credential = credential;
    this.fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  }

  abstract testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult>;
  abstract generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;

  protected async collectStreaming(
    signal?: AbortSignal,
  ): Promise<{ text: string; usage: boolean }> {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      let text = '';
      let completed = false;
      let usage = false;
      for await (const event of this.generate(
        connectionRequest(this.config.model),
        controller.signal,
      )) {
        if (event.type === 'delta') text += event.text;
        if (event.type === 'usage') usage = true;
        if (event.type === 'completed') completed = true;
      }
      if (!completed || !text.trim()) {
        throw new ProviderRuntimeError(
          'AI_STREAM_INTERRUPTED_009',
          'The Provider did not complete the streaming probe.',
          true,
        );
      }
      return { text, usage };
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
}

class OpenAiCompatibleProvider extends BaseProvider {
  readonly protocol = 'openai_compatible' as const;

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.credential ? { authorization: `Bearer ${this.credential}` } : {}),
    };
  }

  private async modelProbe(signal?: AbortSignal): Promise<'verified' | 'unsupported'> {
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'models'),
      { method: 'GET', headers: this.headers() },
      this.config.timeoutMs,
      signal,
    );
    if ([404, 405, 501].includes(response.response.status)) {
      await discard(response);
      return 'unsupported';
    }
    const body = object(await requireJson(response));
    const ids = array(body?.data)
      .map((item) => string(object(item)?.id))
      .filter((value): value is string => Boolean(value));
    if (ids.length === 0) return 'unsupported';
    if (!ids.includes(this.config.model)) {
      throw new ProviderRuntimeError(
        'AI_MODEL_UNSUPPORTED_010',
        'The configured model was not listed.',
        false,
      );
    }
    return 'verified';
  }

  private async nonStreamingProbe(structured: boolean, signal?: AbortSignal): Promise<boolean> {
    const requestBody = connectionRequest(this.config.model, structured);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'chat/completions'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: requestBody.model,
          messages: [
            { role: 'system', content: requestBody.systemPrompt },
            ...requestBody.messages,
          ],
          max_tokens: requestBody.maxOutputTokens,
          temperature: requestBody.temperature,
          stream: false,
          ...(structured && requestBody.structuredOutput
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: requestBody.structuredOutput.name,
                    strict: true,
                    schema: requestBody.structuredOutput.schema,
                  },
                },
              }
            : {}),
        }),
      },
      this.config.timeoutMs,
      signal,
    );
    if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) {
      await discard(response);
      return false;
    }
    const body = object(await requireJson(response));
    const first = object(array(body?.choices)[0]);
    const content = string(object(first?.message)?.content);
    if (!content?.trim()) {
      throw new ProviderRuntimeError(
        'AI_OUTPUT_INVALID_008',
        'The Provider returned no text.',
        false,
      );
    }
    if (!structured) return true;
    try {
      return object(JSON.parse(content))?.ok === true;
    } catch {
      return false;
    }
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult> {
    const modelList = await this.modelProbe(signal);
    await this.nonStreamingProbe(false, signal);
    const streamed = await this.collectStreaming(signal);
    const structuredOutput = await this.nonStreamingProbe(true, signal);
    return {
      modelList,
      actualModel: this.config.model,
      streaming: true,
      structuredOutput,
      tokenUsageAvailable: streamed.usage,
      warnings: [
        ...(modelList === 'unsupported'
          ? ['该端点未提供可用的模型列表，已通过实际生成验证模型。']
          : []),
        ...(!structuredOutput ? ['该模型未通过JSON Schema结构化输出探测。'] : []),
        ...(!streamed.usage ? ['该流未返回Token统计，后续将使用本地估算。'] : []),
      ],
    };
  }

  async *generate(
    requestValue: GenerationRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const generation = GenerationRequestSchema.parse(requestValue);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'chat/completions'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: generation.model,
          messages: [{ role: 'system', content: generation.systemPrompt }, ...generation.messages],
          max_tokens: generation.maxOutputTokens,
          ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
          stream: true,
          stream_options: { include_usage: true },
          ...(generation.structuredOutput
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: generation.structuredOutput.name,
                    strict: true,
                    schema: generation.structuredOutput.schema,
                  },
                },
              }
            : {}),
        }),
      },
      this.config.timeoutMs,
      signal,
    );
    yield ProviderEventSchema.parse({ type: 'connected' });
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
  }
}

class AnthropicProvider extends BaseProvider {
  readonly protocol = 'anthropic' as const;

  private headers(): Record<string, string> {
    const version = string(this.config.options.anthropicVersion) ?? '2023-06-01';
    return {
      'content-type': 'application/json',
      'anthropic-version': version,
      ...(this.credential ? { 'x-api-key': this.credential } : {}),
    };
  }

  private async modelProbe(signal?: AbortSignal): Promise<'verified' | 'unsupported'> {
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'models'),
      { method: 'GET', headers: this.headers() },
      this.config.timeoutMs,
      signal,
    );
    if ([404, 405, 501].includes(response.response.status)) {
      await discard(response);
      return 'unsupported';
    }
    const body = object(await requireJson(response));
    const ids = array(body?.data)
      .map((item) => string(object(item)?.id))
      .filter((value): value is string => Boolean(value));
    if (ids.length === 0) return 'unsupported';
    if (!ids.includes(this.config.model)) {
      throw new ProviderRuntimeError(
        'AI_MODEL_UNSUPPORTED_010',
        'The configured model was not listed.',
        false,
      );
    }
    return 'verified';
  }

  private requestBody(generation: GenerationRequest, stream: boolean, structured: boolean) {
    return {
      model: generation.model,
      system: generation.systemPrompt,
      messages: generation.messages,
      max_tokens: generation.maxOutputTokens,
      ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
      stream,
      ...(structured && generation.structuredOutput
        ? {
            output_config: {
              format: {
                type: 'json_schema',
                schema: generation.structuredOutput.schema,
              },
            },
          }
        : {}),
    };
  }

  private async nonStreamingProbe(structured: boolean, signal?: AbortSignal): Promise<boolean> {
    const generation = connectionRequest(this.config.model, structured);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'messages'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.requestBody(generation, false, structured)),
      },
      this.config.timeoutMs,
      signal,
    );
    if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) {
      await discard(response);
      return false;
    }
    const body = object(await requireJson(response));
    const content = array(body?.content)
      .map((item) => string(object(item)?.text))
      .filter((value): value is string => Boolean(value))
      .join('');
    if (!content.trim()) {
      throw new ProviderRuntimeError(
        'AI_OUTPUT_INVALID_008',
        'The Provider returned no text.',
        false,
      );
    }
    if (!structured) return true;
    try {
      return object(JSON.parse(content))?.ok === true;
    } catch {
      return false;
    }
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult> {
    const modelList = await this.modelProbe(signal);
    await this.nonStreamingProbe(false, signal);
    const streamed = await this.collectStreaming(signal);
    const structuredOutput = await this.nonStreamingProbe(true, signal);
    return {
      modelList,
      actualModel: this.config.model,
      streaming: true,
      structuredOutput,
      tokenUsageAvailable: streamed.usage,
      warnings: [
        ...(modelList === 'unsupported'
          ? ['该端点未提供可用的模型列表，已通过实际生成验证模型。']
          : []),
        ...(!structuredOutput ? ['该模型未通过结构化输出探测。'] : []),
        ...(!streamed.usage ? ['该流未返回Token统计，后续将使用本地估算。'] : []),
      ],
    };
  }

  async *generate(
    requestValue: GenerationRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const generation = GenerationRequestSchema.parse(requestValue);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'messages'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(
          this.requestBody(generation, true, Boolean(generation.structuredOutput)),
        ),
      },
      this.config.timeoutMs,
      signal,
    );
    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    for await (const data of sseData(response)) {
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
      const type = string(payload?.type);
      if (type === 'content_block_delta') {
        const text = string(object(payload?.delta)?.text);
        if (text) yield ProviderEventSchema.parse({ type: 'delta', text });
      }
      if (type === 'message_start' || type === 'message_delta') {
        const usage = object(
          type === 'message_start' ? object(payload?.message)?.usage : payload?.usage,
        );
        const inputTokens = integer(usage?.input_tokens);
        const outputTokens = integer(usage?.output_tokens);
        if (inputTokens !== undefined || outputTokens !== undefined) {
          yield ProviderEventSchema.parse({
            type: 'usage',
            ...(inputTokens === undefined ? {} : { inputTokens }),
            ...(outputTokens === undefined ? {} : { outputTokens }),
          });
        }
      }
      if (type === 'message_stop') {
        completed = true;
        yield ProviderEventSchema.parse({ type: 'completed' });
      }
      if (type === 'error') throw mapHttpError(500);
    }
    if (!completed) {
      throw new ProviderRuntimeError(
        'AI_STREAM_INTERRUPTED_009',
        'The Provider stream ended early.',
        true,
      );
    }
  }
}

export function createProviderAdapter(
  config: ProviderConfig,
  credential: string | null,
  dependencies: ProviderAdapterDependencies = {},
): AIProvider {
  if (config.protocol === 'openai_compatible') {
    return new OpenAiCompatibleProvider(config, credential, dependencies);
  }
  if (config.protocol === 'anthropic') {
    return new AnthropicProvider(config, credential, dependencies);
  }
  throw new ProviderRuntimeError(
    'AI_MODEL_UNSUPPORTED_010',
    'No approved custom Provider adapter is registered.',
    false,
  );
}
