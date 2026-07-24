import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeRendererError } from '../../apps/desktop/renderer/src/app/renderer-error-boundary.js';
import { createRendererStartupDiagnostic } from '../../apps/desktop/renderer/src/runtime/startup-diagnostics.js';
import { createRendererUiStore } from '../../apps/desktop/renderer/src/state/ui-store.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

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
      createRendererUiStore(
        contractInput<Parameters<typeof createRendererUiStore>[0]>({
          ...store.getState(),
          draftDocument: { revision: 1 },
        }),
      ),
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

  it('由React独占首页、项目生命周期和设置节点', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const [legacyHtml, packageEntry, shellSource, homeSource, settingsSource] = await Promise.all([
      readFile(path.join(rendererRoot, 'index.html'), 'utf8'),
      readFile(path.join(rendererRoot, 'index.ts'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/app-shell-m3.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/home/home-page.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/settings/settings-page.tsx'), 'utf8'),
    ]);

    for (const selector of [
      'data-create-project',
      'data-recent-card',
      'data-active-project',
      'data-settings-dialog',
    ]) {
      expect(legacyHtml).not.toContain(selector);
    }
    for (const operation of [
      'worldforge.project.create',
      'worldforge.project.openRecent',
      'worldforge.project.close',
      'worldforge.project.move',
      'worldforge.settings.set',
    ]) {
      expect(packageEntry).not.toContain(operation);
    }
    expect(shellSource).toContain('data-react-shell');
    expect(shellSource).toContain("document.body.dataset.rendererReady = 'true'");
    expect(shellSource).toContain('settingsWriteQueue.current.then');
    expect(shellSource).toContain('confirmedSettings.current = outcome.data.settings');
    expect(shellSource).not.toContain("navigationId === 'home' || navigationId === 'settings'");
    expect(packageEntry).not.toContain("document.body.dataset.rendererReady = 'true'");
    expect(homeSource).toContain('data-react-home');
    expect(settingsSource).toContain('data-react-settings');
  });

  it('将M3-09业务入口迁到React并保留唯一设置控件选择器', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const [legacyHtml, shellSource, settingsSource, stylesSource, canonSource, planningSource] =
      await Promise.all([
        readFile(path.join(rendererRoot, 'index.html'), 'utf8'),
        readFile(path.join(rendererRoot, 'app/app-shell-m3.tsx'), 'utf8'),
        readFile(path.join(rendererRoot, 'features/settings/settings-page.tsx'), 'utf8'),
        readFile(path.join(rendererRoot, 'styles.css'), 'utf8'),
        readFile(path.join(rendererRoot, 'features/canon/canon-core-workbench.tsx'), 'utf8'),
        readFile(
          path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
          'utf8',
        ),
      ]);

    expect(legacyHtml).not.toContain('data-legacy-open-continuity');
    expect(legacyHtml).not.toContain('data-planning-dialog');
    expect(shellSource).toContain('data-open-continuity');
    expect(canonSource).toContain('data-continuity-dialog');
    expect(planningSource).toContain('data-planning-dialog');
    expect(shellSource).toContain("restoreAppShellRoute(project.data ? 'writing' : 'home'");
    expect(settingsSource.match(/data-ui-scale/gu)).toHaveLength(1);
    expect(settingsSource.match(/data-workspace-alignment/gu)).toHaveLength(1);
    expect(settingsSource.match(/data-theme-variant/gu)).toHaveLength(1);
    expect(settingsSource).toContain('disabled={item.disabled || Boolean(props.pendingKey)}');
    expect(stylesSource).not.toContain("body[data-theme-variant='");
    expect(stylesSource).toContain("body[data-visual-theme-variant='dark']");
  });
});
