import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { PlanningModeWorkbench } from '../../apps/desktop/renderer/src/features/planning/planning-mode-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const root = process.cwd();

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), 'utf8');
}

interface ElementProps {
  readonly children?: ReactElement | readonly ReactElement[];
  readonly onClick?: () => void;
  readonly onOpenProfessional?: () => void;
}

function propsOf(element: ReactElement): ElementProps {
  return element.props as ElementProps;
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

    const professionalWorkbench = await source(
      'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx',
    );
    expect(professionalWorkbench).not.toContain('setProfessional');
    expect(professionalWorkbench).not.toContain('data-planning-mode=');
  });

  it('executes both controlled mode transitions without creating local state', () => {
    const bridge = contractInput<RendererBridgeAdapter>({});
    const onChangeMode = vi.fn();
    const onClose = vi.fn();

    const beginner = PlanningModeWorkbench({
      bridge,
      projectId: 'project-a',
      readOnly: false,
      mode: 'beginner',
      onChangeMode,
      onClose,
    }) as ReactElement;
    propsOf(beginner).onOpenProfessional?.();
    expect(onChangeMode).toHaveBeenLastCalledWith('professional');

    const professional = PlanningModeWorkbench({
      bridge,
      projectId: 'project-a',
      readOnly: false,
      mode: 'professional',
      onChangeMode,
      onClose,
    }) as ReactElement;
    const sectionChildren = propsOf(professional).children as readonly ReactElement[];
    const disclosureBar = sectionChildren[0];
    expect(disclosureBar).toBeDefined();
    const barChildren = propsOf(disclosureBar!).children as readonly ReactElement[];
    const switchButton = barChildren[1];
    expect(switchButton).toBeDefined();
    propsOf(switchButton!).onClick?.();

    expect(onChangeMode).toHaveBeenNthCalledWith(1, 'professional');
    expect(onChangeMode).toHaveBeenNthCalledWith(2, 'beginner');
    expect(onClose).not.toHaveBeenCalled();
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
      'onDisclosureModeChange={(mode) => void props.onSaveSettings({ defaultMode: mode })}',
    );
  });
});
