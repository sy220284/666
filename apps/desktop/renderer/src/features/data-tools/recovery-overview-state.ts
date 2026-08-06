import type { BridgeResourceState } from '../../bridge/use-bridge-resource.js';

export type RecoveryOverviewAvailability = 'loading' | 'available' | 'unavailable';

export function recoveryOverviewAvailability(
  state: BridgeResourceState,
  hasData: boolean,
): RecoveryOverviewAvailability {
  if (hasData) return 'available';
  return state === 'loading' ? 'loading' : 'unavailable';
}
