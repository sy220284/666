import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.join(process.cwd(), 'apps/desktop/renderer/src/app');

async function source(file: string): Promise<string> {
  return readFile(path.join(appRoot, file), 'utf8');
}

describe('AR-07 app shell boundaries', () => {
  it('keeps the AppShell root as a controller and presenter composition surface', async () => {
    const root = await source('app-shell-m3.tsx');

    for (const moduleName of [
      'use-workspace-startup',
      'use-project-session-controller',
      'use-app-settings-persistence',
      'use-workspace-runtime',
      'use-app-shell-navigation',
      'use-app-shell-actions',
      'app-shell-layout',
      'app-shell-pages',
      'app-shell-status',
    ]) {
      expect(root).toContain(moduleName);
    }
    for (const operation of [
      'bridge.project.create',
      'bridge.project.openRecent',
      'bridge.project.close',
      'bridge.project.move',
      'bridge.settings.set',
      'bridge.task.subscribe',
      'bridge.app.getCoreStatus',
    ]) {
      expect(root).not.toContain(operation);
    }
    expect(root).not.toContain('data-react-shell');
    expect(root).not.toContain('data-active-project');
  });

  it('serializes settings and flushes Draft then settings before project transitions', async () => {
    const [settings, project] = await Promise.all([
      source('use-app-settings-persistence.ts'),
      source('use-project-session-controller.ts'),
    ]);

    expect(settings).toContain('writeQueue.current.then');
    expect(settings).toContain('confirmedSettings.current = next');
    expect(settings).toContain('await writeQueue.current');
    expect(project).toContain('await flushWriting()');
    expect(project).toContain('await flushSettings()');
    expect(project.indexOf('await flushWriting()')).toBeLessThan(
      project.indexOf('await flushSettings()'),
    );
    for (const operation of [
      'bridge.project.create',
      'bridge.project.openSelected',
      'bridge.project.openRecent',
      'bridge.project.close',
      'bridge.project.move',
    ]) {
      expect(project).toContain(operation);
    }
  });

  it('owns startup compatibility, one task subscription and navigation guards independently', async () => {
    const [startup, runtime, navigation] = await Promise.all([
      source('use-workspace-startup.ts'),
      source('use-workspace-runtime.ts'),
      source('use-app-shell-navigation.ts'),
    ]);

    expect(startup).toContain('bridge.app.getCoreStatus');
    expect(startup).toContain('bridge.project.getActive');
    expect(startup).toContain('restoreAppShellRoute');
    expect(runtime.match(/bridge\.task\.subscribe/gu)).toHaveLength(1);
    expect(runtime).toContain('attentionGeneration.current + 1');
    expect(runtime).toContain("document.body.dataset.rendererReady = 'true'");
    expect(navigation).toContain('flushWriting');
    expect(navigation).toContain('已阻止离开当前写作会话');
    expect(navigation).toContain("dispatch({ type: 'return-to-source' })");
    expect(navigation).toContain('focusAuthorReturnTarget');
  });
});
