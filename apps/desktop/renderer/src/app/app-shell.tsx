import { useEffect } from 'react';

import { layoutPolicyForViewport } from '../layout-model.js';
import { AppShell as AppShellM3, type AppShellProps } from './app-shell-m3.js';

export type { AppShellProps };

export function AppShell(props: AppShellProps) {
  useEffect(() => {
    const applyLayoutState = (): void => {
      const rawScale = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
      const scale = Number.parseFloat(rawScale) || 1;
      const policy = layoutPolicyForViewport(window.innerWidth / scale);
      document.body.dataset.layoutMode = policy.mode;
      document.body.dataset.leftPanel = policy.leftPanel;
    };

    applyLayoutState();
    window.addEventListener('resize', applyLayoutState);
    window.addEventListener('worldforge:presentation-changed', applyLayoutState);
    const observer = new MutationObserver(applyLayoutState);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyLayoutState);
      window.removeEventListener('worldforge:presentation-changed', applyLayoutState);
    };
  }, []);

  return <AppShellM3 {...props} />;
}
