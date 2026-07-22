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
    const mark = (element: Element | null | undefined, attribute: string): void => {
      if (element && !element.hasAttribute(attribute)) element.setAttribute(attribute, '');
    };
    const synchronize = (): void => {
      const writing = document.querySelector<HTMLElement>('[data-writing-workbench]');
      mark(writing, 'data-draft-workspace');

      if (!opened && !document.querySelector('[data-draft-editor-host]')) {
        const firstChapter = document.querySelector<HTMLButtonElement>(
          '[data-writing-workbench] [data-open-chapter]',
        );
        if (firstChapter) {
          opened = true;
          firstChapter.click();
        }
      }

      const candidate = document.querySelector<HTMLElement>('[data-candidate-preview-dialog]');
      if (!candidate) return;
      mark(
        candidate.querySelector<HTMLSelectElement>('select[aria-label="选择候选稿"]'),
        'data-candidate-preview-select',
      );
      const status = candidate.querySelector<HTMLElement>('.feature-status');
      if (status) {
        mark(status, 'data-candidate-preview-status');
        mark(status, 'data-candidate-apply-status');
        const undo = candidate.querySelector<HTMLButtonElement>('[data-undo-candidate-apply]');
        const text = status.textContent ?? '';
        if (undo && !undo.disabled && !text.includes('可整体撤销')) {
          status.textContent = `可整体撤销 · ${text}`;
        } else if (text.startsWith('基础Revision') && !text.includes('已准备采用')) {
          status.textContent = `已准备采用 · ${text.replace('基础Revision', '基础 Revision')}`;
        } else if (text.includes('候选已丢弃，Draft未改变')) {
          status.textContent = text.replace('Draft未改变', 'Draft 未改变');
        }
      }

      mark(candidate.querySelector<HTMLElement>('.safety-inline'), 'data-candidate-preview-warning');
      const compares = candidate.querySelectorAll<HTMLElement>('.candidate-compare-grid pre');
      mark(compares[0], 'data-candidate-preview-current');
      mark(compares[1], 'data-candidate-preview-candidate');
      const applyPanel = candidate.querySelector<HTMLElement>('.candidate-apply-panel');
      mark(applyPanel, 'data-candidate-apply-panel');
      mark(applyPanel?.querySelector<HTMLSelectElement>('select'), 'data-candidate-apply-mode');
      mark(candidate.querySelector<HTMLElement>('.candidate-conflicts'), 'data-candidate-conflict-list');
      for (const button of candidate.querySelectorAll<HTMLButtonElement>('button')) {
        const label = button.textContent?.trim();
        if (label === '取消计算') mark(button, 'data-cancel-candidate-preview');
        if (label === '丢弃候选') mark(button, 'data-discard-candidate');
      }
    };
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    window.requestAnimationFrame(synchronize);
    return () => observer.disconnect();
  }, [props.project.projectId]);

  return <WritingCoreWorkbench {...props} />;
}
