import type { ValidationBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeValidation: ValidationBridge;
  }
}

export {};
