import { useMemo } from 'react';

import { arbitrateStatus, type StatusSignal } from '../foundation/status-arbiter.js';
import { useUiStore } from '../state/ui-store.js';

export function App() {
  const route = useUiStore((state) => state.route);
  const signals = useMemo<readonly StatusSignal[]>(
    () => [
      {
        id: 'renderer-react-foundation',
        priority: 'P3',
        message: 'React renderer foundation active',
        createdAt: Date.now(),
        persistent: false,
      },
    ],
    [],
  );
  const status = arbitrateStatus(signals);

  return (
    <section
      className="react-foundation"
      data-react-foundation
      data-primary-route={route}
      aria-label="WorldForge React renderer foundation"
    >
      <output aria-live="polite">{status?.message}</output>
    </section>
  );
}
