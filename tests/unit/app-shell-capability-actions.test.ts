import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('application shell capability actions', () => {
  it('uses the shared capability matrix for navigation and project actions', async () => {
    const [shell, navigation, layout, pages, home] = await Promise.all([
      readFile('apps/desktop/renderer/src/app/app-shell-m3.tsx', 'utf8'),
      readFile('apps/desktop/renderer/src/app/use-app-shell-navigation.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/app/app-shell-layout.tsx', 'utf8'),
      readFile('apps/desktop/renderer/src/app/app-shell-pages.tsx', 'utf8'),
      readFile('apps/desktop/renderer/src/features/home/home-page.tsx', 'utf8'),
    ]);
    expect(shell).toContain('const capabilities = useMemo');
    expect(shell).toContain('availability: capabilities.navigation');
    expect(pages).toContain('projectCapabilities={props.capabilities.project}');
    expect(layout).toContain('!props.capabilities.project.moveAvailable');

    const navigationStart = navigation.indexOf('createPrimaryNavigationItems({');
    const navigationEnd = navigation.indexOf('});', navigationStart);
    const navigationContext = navigation.slice(navigationStart, navigationEnd);
    expect(navigationStart).toBeGreaterThan(-1);
    expect(navigationContext).toContain('availability');
    expect(navigationContext).toContain('disclosureMode');

    expect(home).toContain('!projectCapabilities.draftReadable');
    expect(home).toContain('!projectCapabilities.structureReadable');
    expect(home).toContain('!projectCapabilities.canonReadable');
  });

  it('flushes the active draft and settings before a settings-triggered Core restart', async () => {
    const actions = await readFile(
      'apps/desktop/renderer/src/app/use-app-shell-actions.ts',
      'utf8',
    );
    const restart = actions.indexOf('const restartCore = useCallback');
    const draftFlush = actions.indexOf('await input.flushWriting()', restart);
    const settingsFlush = actions.indexOf('await input.flushSettings()', restart);
    const bridge = actions.indexOf('await input.bridge.app.restartCore()', restart);
    expect(draftFlush).toBeGreaterThan(restart);
    expect(settingsFlush).toBeGreaterThan(draftFlush);
    expect(bridge).toBeGreaterThan(settingsFlush);
  });
});
