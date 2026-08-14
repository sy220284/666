import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import {
  AppShellPages,
  type AppShellPagesProps,
} from '../../apps/desktop/renderer/src/app/app-shell-pages.js';
import { ResearchWorkbench } from '../../apps/desktop/renderer/src/features/research/research-workbench.js';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const noteId = '22222222-2222-4222-8222-222222222222';

interface ElementProps extends Record<string, unknown> {
  readonly children?: unknown;
}
type TestElement = ReactElement<ElementProps>;

function isElement(value: unknown): value is TestElement {
  return typeof value === 'object' && value !== null && 'props' in value;
}

function descendants(node: unknown, result: TestElement[] = []): TestElement[] {
  if (Array.isArray(node)) {
    for (const item of node) descendants(item, result);
    return result;
  }
  if (!isElement(node)) return result;
  result.push(node);
  descendants(node.props.children, result);
  return result;
}

function props(active: boolean, onNavigateToAuthorTarget = vi.fn(), onTransitionToRoute = vi.fn()) {
  return contractInput<AppShellPagesProps>({
    bridge: contractInput<RendererBridgeAdapter>({}),
    route: 'research',
    activeProject: active
      ? {
          projectId,
          name: '研究资料覆盖作品',
          databaseMode: 'read-write',
        }
      : null,
    selection: { researchNoteId: noteId },
    navigationQuery: '城防',
    onNavigateToAuthorTarget,
    onTransitionToRoute,
  });
}

describe('M12-02 research shell route', () => {
  it('renders only with an active project and maps note selection and close callbacks', async () => {
    const onNavigateToAuthorTarget = vi.fn();
    const onTransitionToRoute = vi.fn(async () => true);
    const root = AppShellPages(
      props(true, onNavigateToAuthorTarget, onTransitionToRoute),
    ) as TestElement;
    const research = descendants(root).find((element) => element.type === ResearchWorkbench);
    expect(research).toBeDefined();
    expect(research?.props).toMatchObject({
      projectId,
      readOnly: false,
      selectedNoteId: noteId,
      navigationQuery: '城防',
    });

    const onSelectNote = research?.props.onSelectNote;
    expect(typeof onSelectNote).toBe('function');
    (onSelectNote as (id: string | null) => void)(null);
    expect(onNavigateToAuthorTarget).not.toHaveBeenCalled();
    (onSelectNote as (id: string | null) => void)(noteId);
    expect(onNavigateToAuthorTarget).toHaveBeenCalledWith({
      type: 'research-note',
      projectId,
      noteId,
      query: null,
    });

    const onClose = research?.props.onClose;
    expect(typeof onClose).toBe('function');
    (onClose as () => void)();
    await Promise.resolve();
    expect(onTransitionToRoute).toHaveBeenCalledWith('writing');

    const inactive = AppShellPages(props(false)) as TestElement;
    expect(descendants(inactive).some((element) => element.type === ResearchWorkbench)).toBe(false);
  });
});
