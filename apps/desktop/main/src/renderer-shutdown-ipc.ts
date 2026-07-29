import { randomUUID } from 'node:crypto';

import {
  PROTOCOL_VERSION,
  RENDERER_SHUTDOWN_CHANNELS,
  RendererShutdownPrepareSchema,
  RendererShutdownResultSchema,
} from '@worldforge/contracts';

const DEFAULT_TIMEOUT_MS = 8_000;

export interface RendererShutdownEvent {
  readonly senderFrame?: { readonly url: string } | null;
}

export interface RendererShutdownIpc {
  on(channel: string, listener: (event: RendererShutdownEvent, raw: unknown) => void): unknown;
  off(channel: string, listener: (event: RendererShutdownEvent, raw: unknown) => void): unknown;
}

export interface RendererShutdownSender {
  send(channel: string, payload: unknown): unknown;
}

export async function requestRendererDraftFlush(
  ipcMain: RendererShutdownIpc,
  webContents: RendererShutdownSender,
  rendererUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const request = RendererShutdownPrepareSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: randomUUID(),
  });

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (saved: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ipcMain.off(RENDERER_SHUTDOWN_CHANNELS.result, onResult);
      resolve(saved);
    };
    const onResult = (event: RendererShutdownEvent, raw: unknown): void => {
      if (event.senderFrame?.url !== rendererUrl) return;
      const parsed = RendererShutdownResultSchema.safeParse(raw);
      if (!parsed.success || parsed.data.requestId !== request.requestId) return;
      finish(parsed.data.saved);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    ipcMain.on(RENDERER_SHUTDOWN_CHANNELS.result, onResult);
    webContents.send(RENDERER_SHUTDOWN_CHANNELS.prepare, request);
  });
}
