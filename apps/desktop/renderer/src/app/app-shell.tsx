import { useEffect } from 'react';

import { AppShell as AppShellM3, type AppShellProps } from './app-shell-m3.js';

export type { AppShellProps };

export function AppShell(props: AppShellProps) {
  const { applicationController } = props;

  useEffect(() => {
    applicationController.refreshPlacement();
    const refreshPlacement = (): void => applicationController.refreshPlacement();
    window.addEventListener('resize', refreshPlacement);
    window.addEventListener('worldforge:presentation-changed', refreshPlacement);
    const observer = new MutationObserver(refreshPlacement);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refreshPlacement);
      window.removeEventListener('worldforge:presentation-changed', refreshPlacement);
    };
  }, [applicationController]);

  return <AppShellM3 {...props} />;
}
