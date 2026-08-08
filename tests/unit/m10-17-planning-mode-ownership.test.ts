import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), 'utf8');
}

describe('M10-17 planning disclosure ownership', () => {
  it('keeps PlanningModeWorkbench controlled by the Settings-owned mode', async () => {
    const modeWorkbench = await source(
      'apps/desktop/renderer/src/features/planning/planning-mode-workbench.tsx',
    );

    expect(modeWorkbench).toContain('readonly mode: AppDisclosureMode;');
    expect(modeWorkbench).toContain('readonly onChangeMode: (mode: AppDisclosureMode) => void;');
    expect(modeWorkbench).toContain("onChangeMode('professional')");
    expect(modeWorkbench).toContain("onChangeMode('beginner')");
    expect(modeWorkbench).not.toContain('MutationObserver');
    expect(modeWorkbench).not.toContain('currentDisclosureMode');
    expect(modeWorkbench).not.toContain('useState');
  });

  it('passes the App Settings mode through the planning hierarchy and persists changes', async () => {
    const planningWorkbench = await source(
      'apps/desktop/renderer/src/features/planning/planning-workbench.tsx',
    );
    const pages = await source('apps/desktop/renderer/src/app/app-shell-pages.tsx');

    expect(planningWorkbench).toContain('mode={props.disclosureMode}');
    expect(planningWorkbench).toContain('onChangeMode={props.onDisclosureModeChange}');
    expect(pages).toContain('disclosureMode={props.disclosureMode}');
    expect(pages).toContain(
      "onDisclosureModeChange={(mode) => void props.onSaveSettings({ defaultMode: mode })}",
    );
  });
});
