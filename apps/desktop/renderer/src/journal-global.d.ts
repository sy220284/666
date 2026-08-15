import type { JournalBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeJournal?: JournalBridge;
  }
}

export {};
