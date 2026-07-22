import { useEffect } from 'react';

import type { ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  WritingWorkbench as WritingCoreWorkbench,
  type WritingPanel,
} from './writing-core-workbench.js';

export type { WritingPanel };

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly panel: WritingPanel;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
}

export function WritingWorkbench(props: WritingWorkbenchProps) {
  useEffect(() => {
    let opened = false;
    const openFirstChapter = (): void => {
      if (opened || document.querySelector('[data-draft-editor-host]')) return;
      const firstChapter = document.querySelector<HTMLButtonElement>(
        '[data-writing-workbench] [data-open-chapter]',
      );
      if (!firstChapter) return;
      opened = true;
      firstChapter.click();
    };
    const observer = new MutationObserver(openFirstChapter);
    observer.observe(document.body, { childList: true, subtree: true });
    window.requestAnimationFrame(openFirstChapter);
    return () => observer.disconnect();
  }, [props.project.projectId]);

  return <WritingCoreWorkbench {...props} />;
}
