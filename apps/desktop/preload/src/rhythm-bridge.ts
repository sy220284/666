import {
  PROTOCOL_VERSION,
  RHYTHM_COMMANDS,
  RHYTHM_IPC_CHANNELS,
  RhythmDashboardResultSchema,
  RhythmGetCommandSchema,
  RhythmRunCommandSchema,
  RhythmUpdateProfileCommandSchema,
  type RhythmProfileUpdateInput,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

async function invoke(
  channel: string,
  schema: { parse(input: unknown): unknown },
  command: string,
  payload: unknown,
) {
  const envelope = schema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    payload,
    sentAt: new Date().toISOString(),
  });
  return RhythmDashboardResultSchema.parse(await ipcRenderer.invoke(channel, envelope));
}

const rhythmBridge = {
  get: (input: { readonly projectId: string }) =>
    invoke(RHYTHM_IPC_CHANNELS.get, RhythmGetCommandSchema, RHYTHM_COMMANDS.get, input),
  run: (input: { readonly projectId: string }) =>
    invoke(RHYTHM_IPC_CHANNELS.run, RhythmRunCommandSchema, RHYTHM_COMMANDS.run, input),
  updateProfile: (input: RhythmProfileUpdateInput) =>
    invoke(
      RHYTHM_IPC_CHANNELS.updateProfile,
      RhythmUpdateProfileCommandSchema,
      RHYTHM_COMMANDS.updateProfile,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeRhythm', rhythmBridge);
