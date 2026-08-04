import { PROTOCOL_VERSION } from '@worldforge/contracts';
import { ipcRenderer } from 'electron';

export interface Parser<Result> {
  parse(input: unknown): Result;
}

export interface CommandEnvelopeOptions {
  readonly projectId?: string;
  readonly requestId?: string;
}

export function envelope(
  command: string,
  payload: unknown,
  projectId?: string,
  requestId = globalThis.crypto.randomUUID(),
): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    command,
    ...(projectId ? { projectId } : {}),
    payload,
    sentAt: new Date().toISOString(),
  };
}

export async function invoke<Result>(
  channel: string,
  command: unknown,
  resultSchema: Parser<Result>,
): Promise<Result> {
  const raw: unknown = await ipcRenderer.invoke(channel, command);
  return resultSchema.parse(raw);
}

export async function invokeCommand<Command, Result>(
  channel: string,
  commandSchema: Parser<Command>,
  resultSchema: Parser<Result>,
  command: string,
  payload: unknown,
  options: CommandEnvelopeOptions = {},
): Promise<Result> {
  const commandEnvelope = commandSchema.parse(
    envelope(command, payload, options.projectId, options.requestId),
  );
  return invoke(channel, commandEnvelope, resultSchema);
}
