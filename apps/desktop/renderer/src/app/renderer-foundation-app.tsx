import { useEffect, useState } from 'react';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { LegacySurfaceController } from '../compat/legacy-surface.js';
import type {
  RendererFoundationRuntime,
  RendererFoundationStartResult,
} from '../runtime/renderer-foundation-runtime.js';
import type { RendererStartupDiagnostic } from '../runtime/startup-diagnostics.js';
import { AppShell } from './app-shell.js';

type FoundationViewState =
  | { readonly state: 'starting'; readonly diagnostic: null }
  | { readonly state: 'running'; readonly diagnostic: null }
  | { readonly state: 'failed'; readonly diagnostic: RendererStartupDiagnostic };

export interface RendererFoundationAppProps {
  readonly runtime: RendererFoundationRuntime;
  readonly bridge: RendererBridgeAdapter;
  readonly legacySurface: LegacySurfaceController;
}

export function RendererFoundationApp({
  runtime,
  bridge,
  legacySurface,
}: RendererFoundationAppProps) {
  const [view, setView] = useState<FoundationViewState>({
    state: 'starting',
    diagnostic: null,
  });

  useEffect(() => {
    let active = true;

    void runtime.start().then((result: RendererFoundationStartResult) => {
      if (!active) return;
      if (result.ok) setView({ state: 'running', diagnostic: null });
      else setView({ state: 'failed', diagnostic: result.diagnostic });
    });

    return () => {
      active = false;
      void runtime.dispose();
    };
  }, [runtime]);

  if (view.state === 'failed') {
    const diagnostic = view.diagnostic;
    return (
      <section
        className="react-foundation-status"
        data-react-runtime="failed"
        data-state="failed"
        role="alert"
      >
        <strong>界面底座启动失败 · {diagnostic.code}</strong>
        <span className="react-foundation-status__details">
          {diagnostic.message}
          {diagnostic.diagnosticId ? ` · 诊断ID ${diagnostic.diagnosticId}` : ''}
          {diagnostic.userAction ? ` · ${diagnostic.userAction}` : ''}
        </span>
      </section>
    );
  }

  if (view.state === 'running') {
    return <AppShell bridge={bridge} legacySurface={legacySurface} />;
  }

  return (
    <section
      className="react-foundation-status"
      data-react-runtime={view.state}
      data-state={view.state}
      role="status"
      aria-live="polite"
    >
      <strong>正在启动React界面底座</strong>
      <span>旧业务界面按任务边界单实例兼容加载</span>
    </section>
  );
}
