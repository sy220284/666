import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import * as publicContracts from '@worldforge/contracts';
import * as appRuntimeContracts from '../../packages/contracts/src/app-runtime-contracts.js';
import * as protocolRegistry from '../../packages/contracts/src/protocol-registry.js';
import type { WorldforgeBridge as InternalWorldforgeBridge } from '../../packages/contracts/src/worldforge-bridge.js';
import type { WorldforgeBridge as PublicWorldforgeBridge } from '@worldforge/contracts';

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

const bridgeSurfaceIsExact: IsExact<PublicWorldforgeBridge, InternalWorldforgeBridge> = true;
const BASELINE = {
  protocolVersion: 1,
  ipcChannelCount: 97,
  appCommandCount: 96,
  runtimeExportCount: 835,
  sha256: '08b3af7bcac8ea200a3eec8b86ba3fd10ee1edd4e0a06bd0131e0aa0ed5891b9',
} as const;

function publicSurfaceDigest(): string {
  const normalized = {
    protocolVersion: publicContracts.PROTOCOL_VERSION,
    ipcChannels: Object.entries(publicContracts.IPC_CHANNELS).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    appCommands: Object.entries(publicContracts.APP_COMMANDS).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    runtimeExports: Object.keys(publicContracts).sort(),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

describe('AR-08 contracts public surface', () => {
  it('preserves the exact runtime export, command and channel baseline', () => {
    expect(publicContracts.PROTOCOL_VERSION).toBe(BASELINE.protocolVersion);
    expect(Object.keys(publicContracts.IPC_CHANNELS)).toHaveLength(BASELINE.ipcChannelCount);
    expect(Object.keys(publicContracts.APP_COMMANDS)).toHaveLength(BASELINE.appCommandCount);
    expect(Object.keys(publicContracts)).toHaveLength(BASELINE.runtimeExportCount);
    expect(publicSurfaceDigest()).toBe(BASELINE.sha256);
  });

  it('keeps the compatibility root wired to the split modules', () => {
    expect(publicContracts.IPC_CHANNELS).toBe(protocolRegistry.IPC_CHANNELS);
    expect(publicContracts.APP_COMMANDS).toBe(protocolRegistry.APP_COMMANDS);
    expect(publicContracts.RegisteredCommandSchema).toBe(protocolRegistry.RegisteredCommandSchema);
    expect(publicContracts.AppInfoSchema).toBe(appRuntimeContracts.AppInfoSchema);
    expect(publicContracts.CoreEventSchema).toBe(appRuntimeContracts.CoreEventSchema);
    expect(bridgeSurfaceIsExact).toBe(true);
  });
});
