import { randomUUID } from 'node:crypto';

import { PROTOCOL_VERSION, type CoreEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { CoreRpcChannel } from '../../apps/desktop/main/src/core-rpc-channel.js';

function healthEvent(requestId: string): CoreEvent {
  return {
    type: 'core.health',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    status: 'healthy',
    uptimeMs: 1,
  };
}

describe('CoreRpcChannel', () => {
  it('rejects a second in-flight request with the same wire key', async () => {
    const channel = new CoreRpcChannel();
    const requestId = randomUUID();
    const first = channel.request({
      key: `core.health:${requestId}`,
      timeoutMs: 100,
      matches: (event) => event.type === 'core.health' && event.requestId === requestId,
      send: () => undefined,
    });

    await expect(
      channel.request({
        key: `core.health:${requestId}`,
        timeoutMs: 100,
        matches: () => true,
        send: () => undefined,
      }),
    ).resolves.toEqual({ state: 'conflict' });

    expect(channel.accept(healthEvent(requestId))).toBe(true);
    await expect(first).resolves.toMatchObject({ state: 'response' });
    expect(channel.pendingCount).toBe(0);
  });

  it('settles every pending request when the process disconnects', async () => {
    const channel = new CoreRpcChannel();
    const first = channel.request({
      key: 'first',
      timeoutMs: 100,
      matches: () => false,
      send: () => undefined,
    });
    const second = channel.request({
      key: 'second',
      timeoutMs: 100,
      matches: () => false,
      send: () => undefined,
    });

    channel.disconnect();

    await expect(first).resolves.toEqual({ state: 'disconnected' });
    await expect(second).resolves.toEqual({ state: 'disconnected' });
    expect(channel.pendingCount).toBe(0);
  });

  it('removes a request immediately when transport send throws', async () => {
    const channel = new CoreRpcChannel();
    const error = new Error('transport closed');

    await expect(
      channel.request({
        key: 'send-failure',
        timeoutMs: 100,
        matches: () => false,
        send: () => {
          throw error;
        },
      }),
    ).resolves.toEqual({ state: 'send-failed', error });
    expect(channel.pendingCount).toBe(0);
  });
});
