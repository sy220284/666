from pathlib import Path


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


replace_once(
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    "  ProviderEditableConfig,\n  ProviderEndpointScope,\n  ProviderSummary,\n",
    "  ProviderConnectionTestResult,\n  ProviderEditableConfig,\n  ProviderEndpointScope,\n  ProviderSummary,\n",
    'provider settings result type import',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    "  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testShape>> | null>(null);",
    "  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);",
    'provider settings test result state',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    "\nasync function testShape() {\n  return null as never;\n}\n",
    "\n",
    'provider settings type helper removal',
)

write(
    'tests/unit/provider-contracts.test.ts',
    r'''import {
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
      ProviderSaveInputSchema.safeParse({ config: base, credential: { action: 'preserve' } }).success,
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
''',
)

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
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
});
''',
)

write(
    'tests/integration/provider-connection.test.ts',
    r'''import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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
      json(response, 200, { data: [{ id: url.includes('anthropic') ? 'claude-test' : 'writer-model' }] });
      return;
    }
    const body = await readBody(request);
    const stream = body.stream === true;
    const structured = 'response_format' in body || 'output_config' in body;
    if (!stream) {
      if (url.includes('anthropic')) {
        json(response, 200, { content: [{ type: 'text', text: structured ? '{"ok":true}' : 'OK' }] });
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
      response.write(`data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 2 } } })}\n\n`);
      response.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: '好' } })}\n\n`);
      if (!options.omitUsage) {
        response.write(`data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 1 } })}\n\n`);
      }
      response.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    } else {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: null }] })}\n\n`);
      if (!options.omitUsage) {
        response.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n\n`);
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
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
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
      new ProviderConnectionService({ lookup, fetch: async () => response }).test(external, 'secret');
    await expect(run(new Response('', { status: 401 }))).rejects.toMatchObject({ code: 'AI_AUTH_FAILED_004' });
    await expect(run(new Response('', { status: 429 }))).rejects.toMatchObject({ code: 'AI_RATE_LIMITED_005' });
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
''',
)

write(
    'tests/security/provider-ipc.test.ts',
    r'''import {
  APP_COMMANDS,
  PROVIDER_CORE_OPERATIONS,
  PROTOCOL_VERSION,
  type CoreProviderOperation,
  type CoreProviderResult,
  type ProviderConfig,
  type ProviderSummary,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const credentialRef = 'cred_550e8400-e29b-41d4-a716-446655440000';
const secret = 'provider-secret-must-not-leak';
const now = '2026-07-25T01:00:00.000Z';
const base = { protocolVersion: PROTOCOL_VERSION, requestId, sentAt: now } as const;
const editable = {
  id: 'local-openai',
  name: '本地模型',
  protocol: 'openai_compatible' as const,
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer-model',
  timeoutMs: 30_000,
  options: {},
};
const stored: ProviderConfig = {
  ...editable,
  credentialRef,
  createdAt: now,
  updatedAt: now,
};
const summary: ProviderSummary = {
  ...editable,
  credentialConfigured: true,
  endpoint: {
    scope: 'loopback',
    origin: 'http://127.0.0.1:11434',
    secureTransport: false,
    warnings: ['请求仅发送到当前设备上的用户配置服务。'],
  },
  createdAt: now,
  updatedAt: now,
};
const preferences: WindowPreferences = {
  displayId: 'display',
  boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

function harness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as IpcMain;
  const operations: CoreProviderOperation[] = [];
  const invokeProviderOperation = vi.fn(async (_id: string, operation: CoreProviderOperation): Promise<CoreProviderResult> => {
    operations.push(operation);
    switch (operation.operation) {
      case PROVIDER_CORE_OPERATIONS.get:
        return { ok: true, operation: operation.operation, data: { provider: operation.providerId === stored.id ? stored : null } };
      case PROVIDER_CORE_OPERATIONS.upsert:
        return { ok: true, operation: operation.operation, data: summary };
      case PROVIDER_CORE_OPERATIONS.list:
        return { ok: true, operation: operation.operation, data: { providers: [summary] } };
      case PROVIDER_CORE_OPERATIONS.remove:
        return { ok: true, operation: operation.operation, data: { removed: true } };
      case PROVIDER_CORE_OPERATIONS.testConnection:
        return {
          ok: true,
          operation: operation.operation,
          data: {
            providerId: stored.id,
            protocol: stored.protocol,
            endpoint: summary.endpoint,
            reachable: true,
            authentication: 'verified',
            modelList: 'verified',
            actualModel: stored.model,
            streaming: true,
            structuredOutput: true,
            tokenUsageAvailable: true,
            latencyMs: 12,
            checkedAt: now,
            warnings: summary.endpoint.warnings,
          },
        };
    }
  });
  const supervisor = {
    getStatus: vi.fn(),
    restart: vi.fn(),
    invokeTaskCommand: vi.fn(),
    invokeAppDataOperation: vi.fn(),
    invokeProviderOperation,
    invokeProjectOperation: vi.fn(),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => true),
    resolve: vi.fn(async () => secret),
  } as unknown as CredentialBroker;
  const log = vi.fn();
  registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    version: '0.1.0',
    platform: 'test',
    logger: { log } as unknown as PrivacyLogger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
  });
  return { handlers, operations, invokeProviderOperation, credentialBroker, log };
}

const trusted = { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent;
const untrusted = { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent;

describe('M4-03 Provider IPC security boundary', () => {
  it('rejects untrusted senders before touching credentials or Core', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:save');
    const command = { ...base, command: APP_COMMANDS.providerSave, payload: { config: editable, credential: { action: 'replace', credential: secret } } };
    await expect(handler?.(untrusted, command)).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(subject.credentialBroker.store).not.toHaveBeenCalled();
    expect(subject.invokeProviderOperation).not.toHaveBeenCalled();
  });

  it('stores the secret only in CredentialBroker and returns no credential reference or secret', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:save');
    const command = { ...base, command: APP_COMMANDS.providerSave, payload: { config: editable, credential: { action: 'replace', credential: secret } } };
    const result = await handler?.(trusted, command);
    expect(subject.credentialBroker.store).toHaveBeenCalledWith(editable.id, secret);
    const upsert = subject.operations.find((operation) => operation.operation === PROVIDER_CORE_OPERATIONS.upsert);
    expect(upsert).toMatchObject({ config: { credentialRef } });
    expect(JSON.stringify(upsert)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(credentialRef);
    expect(JSON.stringify(subject.log.mock.calls)).not.toContain(secret);
  });

  it('resolves credentials only for the internal connection request and sanitizes the Renderer result', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:test-connection');
    const result = await handler?.(trusted, {
      ...base,
      command: APP_COMMANDS.providerTestConnection,
      payload: { providerId: stored.id },
    });
    expect(subject.credentialBroker.resolve).toHaveBeenCalledWith(credentialRef);
    const testOperation = subject.operations.find((operation) => operation.operation === PROVIDER_CORE_OPERATIONS.testConnection);
    expect(testOperation).toMatchObject({ credential: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(credentialRef);
  });
});
''',
)

write(
    'tests/e2e/provider-settings.spec.ts',
    r'''import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];

async function launch(): Promise<ElectronApplication> {
  const userData = await mkdtemp(path.join(tmpdir(), 'worldforge-provider-e2e-'));
  temporaryDirectories.push(userData);
  const args = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(process.cwd(), 'apps/desktop/main'));
  return electron.launch({
    args,
    env: { ...process.env, WORLDFORGE_E2E: '1', WORLDFORGE_E2E_USER_DATA: userData },
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
}

test.afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test('configures a local keyless Provider and keeps offline writing healthy after a safe connection failure', async () => {
  const application = await launch();
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-settings]').click();
    await page.locator('[data-settings-navigation="providers"]').click();
    await expect(page.locator('[data-provider-settings]')).toBeVisible();
    await page.locator('[data-provider-id]').fill('local-e2e');
    await page.locator('[data-provider-name]').fill('本地E2E模型');
    await page.locator('[data-provider-model]').fill('writer-model');
    await page.locator('[data-provider-base-url]').fill('http://127.0.0.1:65530/v1');
    await page.locator('[data-provider-save]').click();
    await expect(page.locator('[data-provider-card="local-e2e"]')).toBeVisible();
    await expect(page.locator('[data-provider-status]')).toContainText('已保存');
    await page.locator('[data-provider-test="local-e2e"]').click();
    await expect(page.locator('[data-provider-status]')).toContainText('AI_CONNECTION_FAILED_003');
    const core = await page.evaluate(async () => globalThis.worldforge.app.getCoreStatus());
    expect(core).toMatchObject({ ok: true, data: { status: 'healthy' } });
    await expect(page.locator('[data-provider-card="local-e2e"]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});
''',
)
