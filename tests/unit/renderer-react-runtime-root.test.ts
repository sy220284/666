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

  it('按责任域加载Base、Layout、Components与Theme样式层', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer');
    const [buildSource, htmlSource, baseStyles, layoutStyles, themeStyles] = await Promise.all([
      readFile(path.join(rendererRoot, 'build-assets.mjs'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/index.html'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/styles/base.css'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/styles/layout.css'), 'utf8'),
      readFile(path.join(rendererRoot, 'src/styles/themes.css'), 'utf8'),
    ]);

    for (const stylePath of [
      'base.css',
      'layout.css',
      'components/01-shell.css',
      'components/06-review.css',
      'themes.css',
    ]) {
      expect(buildSource).toContain(`'${stylePath}'`);
      expect(htmlSource).toContain(`href="./styles/${stylePath}"`);
    }
    expect(baseStyles).toContain('@layer base, layout, components, themes;');
    expect(layoutStyles).toContain('@layer layout');
    expect(themeStyles).toContain('@layer themes');
    expect(themeStyles).toContain('container-type: inline-size');
    expect(themeStyles).toContain('@container author-main (max-width: 1120px)');
    expect(themeStyles).toContain("body[data-visual-theme-variant='dark'] .worldforge-editor");
    for (const retiredStyle of ['styles.css', 'm3.css', 'm8-07.css']) {
      await expect(readFile(path.join(rendererRoot, 'src', retiredStyle), 'utf8')).rejects.toThrow();
    }
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
    const [
      legacyHtml,
      packageEntry,
      shellRoot,
      shellLayout,
      settingsController,
      applicationController,
      runtimeController,
      homeSource,
      settingsSource,
    ] = await Promise.all([
      readFile(path.join(rendererRoot, 'index.html'), 'utf8'),
      readFile(path.join(rendererRoot, 'index.ts'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/app-shell-m3.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/app-shell-layout.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/use-app-settings-persistence.ts'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/renderer-application-controller.ts'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/use-workspace-runtime.ts'), 'utf8'),
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
    expect(shellRoot).toContain("from './app-shell-layout.js'");
    expect(shellRoot).toContain("from './app-shell-pages.js'");
    expect(shellRoot).not.toContain('data-react-shell');
    expect(shellLayout).toContain('data-react-shell');
    expect(runtimeController).toContain("document.body.dataset.rendererReady = 'true'");
    expect(settingsController).toContain('writeQueue.current.then');
    expect(settingsController).toContain('confirmedSettings.current = next');
    expect(settingsController).toContain('applicationController.applyPresentation');
    expect(applicationController).toContain('flushPendingDraft: flushRegisteredDraft');
    expect(applicationController).toContain('applyPresentation(settings, appearance, projectState)');
    expect(applicationController).toContain('layoutPolicyForViewport');
    expect(shellRoot).not.toContain("navigationId === 'home' || navigationId === 'settings'");
    expect(packageEntry).not.toContain("document.body.dataset.rendererReady = 'true'");
    expect(homeSource).toContain('data-react-home');
    expect(settingsSource).toContain('data-react-settings');
  });

  it('将M3-09业务入口迁到React并保留唯一设置控件选择器', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const [
      legacyHtml,
      shellLayout,
      startup,
      settingsSource,
      stylesSource,
      canonSource,
      planningSource,
    ] = await Promise.all([
      readFile(path.join(rendererRoot, 'index.html'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/app-shell-layout.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'app/use-workspace-startup.ts'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/settings/settings-page.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'styles/themes.css'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/continuity-panel.tsx'), 'utf8'),
      readFile(
        path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
        'utf8',
      ),
    ]);

    expect(legacyHtml).not.toContain('data-legacy-open-continuity');
    expect(legacyHtml).not.toContain('data-planning-dialog');
    expect(shellLayout).toContain('data-open-continuity');
    expect(canonSource).toContain('data-continuity-dialog');
    expect(planningSource).toContain('data-planning-dialog');
    expect(startup).toContain('bridge.project.getContinuation');
    expect(startup).toContain('route: restoreAppShellRoute(restoredRoute');
    expect(settingsSource.match(/data-ui-scale/gu)).toHaveLength(1);
    expect(settingsSource.match(/data-workspace-alignment/gu)).toHaveLength(1);
    expect(settingsSource.match(/data-theme-variant/gu)).toHaveLength(1);
    expect(settingsSource).toContain('disabled={item.disabled || Boolean(props.pendingKey)}');
    expect(stylesSource).not.toContain("body[data-theme-variant='");
    const entrySource = await readFile(path.join(rendererRoot, 'react-entry.tsx'), 'utf8');
    expect(entrySource).toContain('createRendererApplicationController');
    expect(entrySource).not.toContain('legacy-surface');
    await expect(
      readFile(path.join(rendererRoot, 'compat/legacy-surface.ts'), 'utf8'),
    ).rejects.toThrow();
    expect(stylesSource).toContain("body[data-visual-theme-variant='dark']");
  });
});
