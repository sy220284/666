import type { StateProposalBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeStateProposal: StateProposalBridge;
  }
}

export {};
