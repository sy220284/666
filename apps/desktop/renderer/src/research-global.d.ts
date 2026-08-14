import type { ResearchBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeResearch: ResearchBridge;
  }
}

export {};
