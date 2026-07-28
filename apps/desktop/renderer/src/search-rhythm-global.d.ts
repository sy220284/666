import type { RhythmBridge, SearchToolsBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeSearchTools: SearchToolsBridge;
    readonly worldforgeRhythm: RhythmBridge;
  }
}

export {};
