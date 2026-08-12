import type { IdeaCapsuleBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeIdeaCapsule: IdeaCapsuleBridge;
  }
}

export {};
