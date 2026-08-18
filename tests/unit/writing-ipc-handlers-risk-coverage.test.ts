import { describe, expect, it, vi } from 'vitest';

import {
  APP_COMMANDS,
  DRAFT_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  VERSION_COMMANDS,
} from '@worldforge/contracts';
import { registerWritingIpcHandlers } from '../../apps/desktop/main/src/writing-ipc-handlers.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const chapterId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';
const credentialRef = 'cred_55555555-5555-4555-8555-555555555555';
const trustedEvent = { trusted: true };
const untrustedEvent = { trusted: false };

type Context = Parameters<typeof registerWritingIpcHandlers>[0];
type Handler = (event: unknown, raw: unknown) => unknown;

function envelope(command: string, payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    command,
    payload,
    sentAt: '2026-08-18T00:00:00.000Z',
  };
}

function createHarness() {
  const handlers = new Map<string, Handler>();
  const rejectUntrusted = vi.fn((event: unknown) =>
    event === untrustedEvent ? { kind: 'rejected' } : null,
  );
  const invalidRequest = vi.fn(() => ({ kind: 'invalid' }));
  const invokeProject = vi.fn(async (id: string, operation: unknown) => ({
    kind: 'project',
    requestId: id,
    operation,
  }));
  const success = vi.fn((id: string, data: unknown) => ({ ok: true, requestId: id, data }));
  const failure = vi.fn(
    (id: string, code: string, message: string, retryable: boolean, diagnosticId?: string) => ({
      ok: false,
      requestId: id,
      error: { code, message, retryable, diagnosticId },
    }),
  );
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => false),
  };
  const logger = { log: vi.fn(async () => undefined) };

  registerWritingIpcHandlers(
    contractInput<Context>({
      options: { credentialBroker, logger },
      register: (channel: string, handler: Handler) => handlers.set(channel, handler),
      rejectUntrusted,
      invalidRequest,
      invokeProject,
      success,
      failure,
    }),
  );

  return {
    handlers,
    rejectUntrusted,
    invalidRequest,
    invokeProject,
    success,
    failure,
    credentialBroker,
    logger,
  };
}

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  raw: unknown,
  event: unknown = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return await handler?.(event, raw);
}

describe('writing IPC high-risk boundaries', () => {
  it('rejects untrusted or malformed draft/version requests before project dispatch', async () => {
    const harness = createHarness();
    const draftCommand = envelope(DRAFT_COMMANDS.openDraft, { projectId, chapterId });

    await expect(
      call(harness, IPC_CHANNELS.openDraft, draftCommand, untrustedEvent),
    ).resolves.toEqual({ kind: 'rejected' });
    await expect(
      call(harness, IPC_CHANNELS.openDraft, { ...draftCommand, payload: { projectId: 'bad' } }),
    ).resolves.toEqual({ kind: 'invalid' });

    const versionCommand = envelope(VERSION_COMMANDS.listVersions, { projectId, chapterId });
    await expect(
      call(harness, IPC_CHANNELS.listVersions, versionCommand, untrustedEvent),
    ).resolves.toEqual({ kind: 'rejected' });
    await expect(
      call(harness, IPC_CHANNELS.listVersions, {
        ...versionCommand,
        payload: { projectId, chapterId: 'bad' },
      }),
    ).resolves.toEqual({ kind: 'invalid' });

    expect(harness.invokeProject).not.toHaveBeenCalled();
  });

  it('dispatches trusted draft and version commands with exact authoritative payloads', async () => {
    const harness = createHarness();

    await expect(
      call(
        harness,
        IPC_CHANNELS.openDraft,
        envelope(DRAFT_COMMANDS.openDraft, { projectId, chapterId }),
      ),
    ).resolves.toMatchObject({ kind: 'project', requestId });
    expect(harness.invokeProject).toHaveBeenLastCalledWith(requestId, {
      operation: DRAFT_COMMANDS.openDraft,
      input: { projectId, chapterId },
    });

    await expect(
      call(
        harness,
        IPC_CHANNELS.createVersion,
        envelope(VERSION_COMMANDS.createVersion, {
          projectId,
          chapterId,
          draftId,
          baseRevision: 7,
          title: '高风险边界留档',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'project', requestId });
    expect(harness.invokeProject).toHaveBeenLastCalledWith(requestId, {
      operation: VERSION_COMMANDS.createVersion,
      input: {
        projectId,
        chapterId,
        draftId,
        baseRevision: 7,
        versionType: 'manual',
        title: '高风险边界留档',
      },
    });
  });

  it('stores, removes and checks credentials without exposing the credential value', async () => {
    const harness = createHarness();
    const secret = 'provider-secret-value';

    await expect(
      call(
        harness,
        IPC_CHANNELS.aiSetCredential,
        envelope(APP_COMMANDS.setCredential, { providerId: 'provider.test', credential: secret }),
      ),
    ).resolves.toEqual({ ok: true, requestId, data: { credentialRef } });
    expect(harness.credentialBroker.store).toHaveBeenCalledWith('provider.test', secret);
    expect(harness.success).toHaveBeenCalledWith(requestId, { credentialRef });
    expect(JSON.stringify(harness.success.mock.calls)).not.toContain(secret);

    await expect(
      call(
        harness,
        IPC_CHANNELS.aiRemoveCredential,
        envelope(APP_COMMANDS.removeCredential, { credentialRef }),
      ),
    ).resolves.toEqual({ ok: true, requestId, data: { exists: true } });
    expect(harness.credentialBroker.remove).toHaveBeenCalledWith(credentialRef);

    await expect(
      call(
        harness,
        IPC_CHANNELS.aiHasCredential,
        envelope(APP_COMMANDS.hasCredential, { credentialRef }),
      ),
    ).resolves.toEqual({ ok: true, requestId, data: { exists: false } });
    expect(harness.credentialBroker.has).toHaveBeenCalledWith(credentialRef);
  });

  it('fails closed on credential storage errors and records only provider metadata', async () => {
    const harness = createHarness();
    harness.credentialBroker.store.mockRejectedValueOnce(new Error('secure-store-unavailable'));

    const result = await call(
      harness,
      IPC_CHANNELS.aiSetCredential,
      envelope(APP_COMMANDS.setCredential, {
        providerId: 'provider.test',
        credential: 'must-not-enter-log',
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      requestId,
      error: {
        code: 'AI_CREDENTIAL_MISSING_002',
        retryable: true,
        diagnosticId: expect.any(String),
      },
    });
    expect(harness.logger.log).toHaveBeenCalledWith('error', 'credential.store.failed', {
      providerId: 'provider.test',
      errorCode: 'AI_CREDENTIAL_MISSING_002',
      diagnosticId: expect.any(String),
    });
    expect(JSON.stringify(harness.logger.log.mock.calls)).not.toContain('must-not-enter-log');
  });
});
