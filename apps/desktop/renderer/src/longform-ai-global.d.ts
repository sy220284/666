import type { LongformAiBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeLongformAi: LongformAiBridge;
  }
}

export {};
