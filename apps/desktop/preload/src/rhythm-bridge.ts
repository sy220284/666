import {
  RHYTHM_COMMANDS,
  RHYTHM_IPC_CHANNELS,
  RhythmDashboardResultSchema,
  RhythmGetCommandSchema,
  RhythmRunCommandSchema,
  RhythmUpdateProfileCommandSchema,
  type RhythmProfileUpdateInput,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand, type Parser } from './bridge-runtime.js';

function invoke(channel: string, schema: Parser<unknown>, command: string, payload: unknown) {
  return invokeCommand(channel, schema, RhythmDashboardResultSchema, command, payload);
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
