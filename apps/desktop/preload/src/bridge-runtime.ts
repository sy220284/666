import { PROTOCOL_VERSION } from '@worldforge/contracts';
import { ipcRenderer } from 'electron';

export interface Parser<Result> {
  parse(input: unknown): Result;
}

export function envelope(
  command: string,
  payload: unknown,
  projectId?: string,
): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
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
