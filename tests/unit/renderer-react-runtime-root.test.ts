import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeRendererError } from '../../apps/desktop/renderer/src/app/renderer-error-boundary.js';
import { createRendererStartupDiagnostic } from '../../apps/desktop/renderer/src/runtime/startup-diagnostics.js';
import { createRendererUiStore } from '../../apps/desktop/renderer/src/state/ui-store.js';

describe('M3-08 React运行底座', () => {
  it('将真实构建入口切换到唯一可见React Root', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer');
    const [buildSource, htmlSource, entrySource, tsconfigSource] = await Promise.all([
      readFile(path.join(rendererRoot, 'build-assets.mjs'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/index.html'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/react-entry.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'tsconfig.json'), 'utf8'),
    ]);

    expect(buildSource).toContain('./src/react-entry.tsx');
    expect(buildSource).not.toContain("entryPoints: [new URL('./src/entry.ts'");
    expect(htmlSource.match(/id="react-root"/gu)).toHaveLength(1);
    expect(entrySource).toContain('createRoot(rootElement)');
    expect(entrySource).toContain("dataset.reactMounted = 'true'");
    expect(tsconfigSource).toContain('"jsx": "react-jsx"');
    expect(tsconfigSource).toContain('"src/**/*.tsx"');
  });

  it('通过Zustand Store更新临时状态且不接受权威对象', () => {
    const store = createRendererUiStore();

    store.getState().dispatch({ type: 'navigate', route: 'settings' });
    store.getState().dispatch({
      type: 'select',
      selection: { projectId: 'project-1', chapterId: 'chapter-1' },
    });

    expect(store.getState()).toMatchObject({
      route: 'settings',
      selection: { projectId: 'project-1', chapterId: 'chapter-1' },
    });
    expect(() =>
      createRendererUiStore({
        ...store.getState(),
        draftDocument: { revision: 1 },
      } as never),
    ).toThrow(/authoritative field/u);
  });

  it('在错误边界与启动诊断中保留安全P0元数据', () => {
    const error = normalizeRendererError({
      code: 'CORE_PROTOCOL_MISMATCH',
      message: '协议不兼容。',
      retryable: false,
      diagnosticId: 'diag-protocol-1',
      userAction: '更新应用。',
      details: { expectedProtocolVersion: 2 },
    });
    const startup = createRendererStartupDiagnostic(error, {
      occurredAt: '2026-07-22T00:00:00.000Z',
      rendererVersion: '0.1.0',
      protocolVersion: 1,
      phase: 'react-root',
    });

    expect(startup).toMatchObject({
      severity: 'P0',
      code: 'CORE_PROTOCOL_MISMATCH',
      retryable: false,
      diagnosticId: 'diag-protocol-1',
      userAction: '更新应用。',
      details: { expectedProtocolVersion: 2 },
      phase: 'react-root',
    });
  });
});
