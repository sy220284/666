import {
  RENDERER_SHUTDOWN_CHANNELS,
  RendererShutdownPrepareSchema,
  RendererShutdownResultSchema,
  type RendererLifecycleBridge,
} from '@worldforge/contracts';
import { ipcRenderer } from 'electron';

export const rendererLifecycleBridge: RendererLifecycleBridge = {
  onShutdownPrepare: (listener) => {
    const receive = (_event: unknown, raw: unknown): void => {
      const parsed = RendererShutdownPrepareSchema.safeParse(raw);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(RENDERER_SHUTDOWN_CHANNELS.prepare, receive);
    return () => ipcRenderer.off(RENDERER_SHUTDOWN_CHANNELS.prepare, receive);
  },
  acknowledgeShutdown: (result) => {
    ipcRenderer.send(RENDERER_SHUTDOWN_CHANNELS.result, RendererShutdownResultSchema.parse(result));
  },
};
