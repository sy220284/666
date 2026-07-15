import type { WorldforgeBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforge: WorldforgeBridge;
  }
}

export {};
